const axios = require('axios');
const pool = require('../config/database');

// URL of the capture app API
const CAPTURE_APP_URL = process.env.CAPTURE_APP_URL || 'http://localhost:5001';

/**
 * Fetch approved cards from capture app and save to approved_cards history table
 * Also add new cards to print queue
 */
const syncApprovedCards = async () => {
  try {
    console.log('========================================');
    console.log('🔄 Syncing approved cards from capture app...');
    console.log('Capture app URL:', CAPTURE_APP_URL);
    console.log('========================================');
    
    // Fetch approved cards from capture app with timeout
    const response = await axios.get(`${CAPTURE_APP_URL}/api/printing/approved`, {
      timeout: 10000 // 10 second timeout
    });
    
    console.log('📡 Response status:', response.status);
    console.log('📦 Response data:', JSON.stringify(response.data, null, 2));
    
    if (!response.data.success) {
      throw new Error('Failed to fetch approved cards');
    }

    const approvedCards = response.data.cards || [];
    console.log(`📋 Found ${approvedCards.length} approved cards in capture app`);
    
    if (approvedCards.length > 0) {
      console.log('Sample card data:', JSON.stringify(approvedCards[0], null, 2));
    }

    let addedToHistory = 0;
    let addedToQueue = 0;
    let skipped = 0;
    let errors = 0;

    for (const card of approvedCards) {
      try {
        console.log(`\n🔍 Processing card ID ${card.id}: ${card.surname} ${card.other_names}`);
        
        // Convert base64 images back to buffer if present
        const passportBuffer = card.passport_photo ? Buffer.from(card.passport_photo, 'base64') : null;
        
        // 1. Save to approved_cards history table (permanent storage)
        const historyCheck = await pool.query(
          'SELECT id FROM approved_cards WHERE card_id = $1',
          [card.id]
        );

        if (historyCheck.rows.length === 0) {
          await pool.query(`
            INSERT INTO approved_cards 
            (card_id, surname, other_names, matric_no, staff_id, faculty, department, 
             level, card_number, session, passport_photo, approved_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            card.id,
            card.surname,
            card.other_names,
            card.matric_no,
            card.staff_id,
            card.faculty,
            card.department,
            card.level,
            card.card_number,
            card.session,
            passportBuffer,
            card.approved_at || new Date()
          ]);
          console.log(`  ✅ Saved to approved_cards history`);
          addedToHistory++;
        } else {
          console.log(`  ℹ️  Already in approved_cards history`);
        }
        
        // 2. Check if already in print queue
        const queueCheck = await pool.query(
          'SELECT id FROM print_queue WHERE card_id = $1',
          [card.id]
        );

        if (queueCheck.rows.length > 0) {
          console.log(`  ⏭️  Already in print queue (queue ID: ${queueCheck.rows[0].id})`);
          skipped++;
          continue;
        }

        // 3. Add to print queue for printing
        console.log(`  ➕ Adding to print queue...`);
        const result = await pool.query(`
          INSERT INTO print_queue 
          (card_id, surname, other_names, matric_no, staff_id, faculty, department, 
           level, card_number, session, passport_photo, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'queued')
          RETURNING id
        `, [
          card.id,
          card.surname,
          card.other_names,
          card.matric_no,
          card.staff_id,
          card.faculty,
          card.department,
          card.level,
          card.card_number,
          card.session,
          passportBuffer
        ]);

        console.log(`  ✅ Added to print queue (queue ID: ${result.rows[0].id})`);
        addedToQueue++;
      } catch (err) {
        console.error(`  ❌ Error processing card ${card.id}:`, err.message);
        console.error(`     Error code:`, err.code);
        console.error(`     Error detail:`, err.detail);
        errors++;
      }
    }

    console.log('\n========================================');
    console.log('📊 Sync Summary:');
    console.log(`   ✅ Added to history: ${addedToHistory}`);
    console.log(`   ✅ Added to queue: ${addedToQueue}`);
    console.log(`   ⏭️  Skipped (already in queue): ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📋 Total processed: ${approvedCards.length}`);
    console.log('========================================\n');
    
    return { 
      addedToHistory,
      addedToQueue,
      skipped, 
      errors,
      total: approvedCards.length,
      message: `Synced ${addedToHistory} to history, ${addedToQueue} to queue, ${skipped} already in queue, ${errors} errors`
    };

  } catch (error) {
    // Handle connection errors gracefully
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error('❌ Capture app is not available at:', CAPTURE_APP_URL);
      console.error('   Make sure capture app is running on port 5001');
      return { 
        addedToHistory: 0,
        addedToQueue: 0,
        skipped: 0, 
        errors: 0,
        total: 0, 
        message: 'Capture app not available' 
      };
    }
    
    console.error('❌ Error syncing approved cards:', error.message);
    console.error('   Error details:', error);
    throw error;
  }
};

/**
 * Notify capture app that a card has been printed
 */
const notifyCardPrinted = async (cardId) => {
  try {
    await axios.post(`${CAPTURE_APP_URL}/api/printing/mark-printed/${cardId}`);
  } catch (error) {
    console.error(`Error notifying capture app for card ${cardId}:`, error.message);
    // Don't throw - printing succeeded even if notification failed
  }
};

/**
 * Notify capture app that a card has been collected
 */
const notifyCardCollected = async (cardId) => {
  try {
    await axios.post(`${CAPTURE_APP_URL}/api/printing/mark-collected/${cardId}`);
  } catch (error) {
    console.error(`Error notifying capture app for card ${cardId}:`, error.message);
  }
};

/**
 * Verify fingerprint against stored fingerprint in capture app for a given card
 * Capture app scans the currently placed finger and compares against stored templates
 * Only one finger needs to match
 */
const verifyFingerprint = async (cardId, scannedFingerprintBase64) => {
  try {
    const response = await axios.post(
      `${CAPTURE_APP_URL}/api/verify/fingerprint`,
      { cardId, scannedFingerprint: scannedFingerprintBase64 || null },
      {
        timeout: 15000,
        headers: { 'X-Api-Key': process.env.VERIFY_API_KEY || '' }
      }
    );
    return {
      success: response.data.success || false,
      matched: response.data.matched || false,
      studentName: response.data.studentName || null,
      message: response.data.message || 'Verification complete'
    };
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return { success: false, matched: false, message: 'Capture app is not available' };
    }
    if (error.response) {
      return {
        success: false,
        matched: false,
        message: error.response.data?.message || 'Fingerprint verification failed'
      };
    }
    return { success: false, matched: false, message: error.message };
  }
};

module.exports = {
  syncApprovedCards,
  notifyCardPrinted,
  notifyCardCollected,
  verifyFingerprint
};
