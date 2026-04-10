const axios = require('axios');
const pool = require('../config/database');

// URL of the capture app API
const CAPTURE_APP_URL = process.env.CAPTURE_APP_URL || 'http://localhost:5001';

const normalizeFingerprint = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Support data URL payloads from some scanner clients.
  const marker = 'base64,';
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex >= 0) {
    return trimmed.slice(markerIndex + marker.length).replace(/\s+/g, '');
  }
  return trimmed.replace(/\s+/g, '');
};

const extractCardIdentity = (card) => ({
  id: card.id ?? card.card_id ?? card.cardId,
  surname: card.surname ?? card.last_name ?? '',
  other_names: card.other_names ?? card.first_name ?? card.otherNames ?? '',
  matric_no: card.matric_no ?? card.matricNumber ?? null,
  staff_id: card.staff_id ?? card.staffId ?? null,
  faculty: card.faculty ?? null,
  department: card.department ?? null,
  level: card.level ?? null,
  card_number: card.card_number ?? card.cardNumber ?? null,
  session: card.session ?? null,
  passport_photo: card.passport_photo ?? card.photo ?? null,
  approved_at: card.approved_at ?? card.updated_at ?? card.created_at ?? new Date()
});

const ensureQueueExclusionsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS print_queue_exclusions (
      id SERIAL PRIMARY KEY,
      card_id INTEGER NOT NULL UNIQUE,
      reason VARCHAR(50) NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const excludeCardFromQueue = async (cardId, reason = 'removed', userId = null, dbClient = null) => {
  const executor = dbClient || pool;

  await executor.query(
    `INSERT INTO print_queue_exclusions (card_id, reason, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (card_id)
     DO UPDATE SET reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, created_at = CURRENT_TIMESTAMP`,
    [cardId, reason, userId]
  );
};

/**
 * Fetch approved cards from capture app and save to approved_cards history table
 * Also add new cards to print queue
 */
const syncApprovedCards = async () => {
  try {
    await ensureQueueExclusionsTable();

    console.log('========================================');
    console.log('🔄 Syncing approved cards from capture app...');
    console.log('Capture app URL:', CAPTURE_APP_URL);
    console.log('========================================');
    
    // Fetch queue cards from capture app (source of truth for printable approved cards)
    const response = await axios.get(`${CAPTURE_APP_URL}/api/printing/queue`, {
      timeout: 10000 // 10 second timeout
    });
    
    console.log('📡 Response status:', response.status);
    console.log('📦 Response data:', JSON.stringify(response.data, null, 2));
    
    if (!response.data?.success) {
      throw new Error('Failed to fetch print queue from capture app');
    }

    const queueCards = response.data.cards || response.data.queue || [];
    const approvedCards = queueCards
      .map(extractCardIdentity)
      .filter((card) => card.id !== undefined && card.id !== null)
      .filter((card) => {
        // Keep only approved cards when status is present.
        const source = queueCards.find((q) => String(q.id ?? q.card_id ?? q.cardId) === String(card.id));
        if (!source?.status) return true;
        return String(source.status).toLowerCase() === 'approved';
      });

    console.log(`📋 Found ${approvedCards.length} approved queue cards in capture app`);
    
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
        
        // 2. Skip cards explicitly excluded from queue (printed/removed locally)
        const exclusionCheck = await pool.query(
          'SELECT id, reason FROM print_queue_exclusions WHERE card_id = $1',
          [card.id]
        );

        if (exclusionCheck.rows.length > 0) {
          console.log(`  ⏭️  Excluded from queue (reason: ${exclusionCheck.rows[0].reason})`);
          skipped++;
          continue;
        }

        // 3. Skip cards that are already in collections/history (already printed flow)
        const collectionCheck = await pool.query(
          'SELECT id FROM card_collections WHERE card_id = $1 LIMIT 1',
          [card.id]
        );

        if (collectionCheck.rows.length > 0) {
          console.log('  ⏭️  Already in collection workflow, skipping queue insert');
          skipped++;
          continue;
        }

        const historyPrintCheck = await pool.query(
          'SELECT id FROM print_history WHERE card_id = $1 LIMIT 1',
          [card.id]
        );

        if (historyPrintCheck.rows.length > 0) {
          console.log('  ⏭️  Already in print history, skipping queue insert');
          skipped++;
          continue;
        }

        // 4. Check if already in print queue
        const queueCheck = await pool.query(
          'SELECT id FROM print_queue WHERE card_id = $1',
          [card.id]
        );

        if (queueCheck.rows.length > 0) {
          console.log(`  ⏭️  Already in print queue (queue ID: ${queueCheck.rows[0].id})`);
          skipped++;
          continue;
        }

        // 5. Add to print queue for printing
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
      console.error('   Make sure capture app is reachable at CAPTURE_APP_URL');
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
  // Validate inputs
  if (!cardId) {
    console.error('[Fingerprint] Card ID is required for verification');
    return {
      success: false,
      matched: false,
      message: 'Card ID is required for fingerprint verification'
    };
  }

  // Check if CAPTURE_APP_URL is properly configured for production
  if (!process.env.CAPTURE_APP_URL || process.env.CAPTURE_APP_URL === 'http://localhost:5001') {
    console.error('[Fingerprint] ⚠️  CAPTURE_APP_URL not configured for production. Current value:', CAPTURE_APP_URL);
    return {
      success: false,
      matched: false,
      message: 'Fingerprint verification is not available in this environment. Please configure CAPTURE_APP_URL.',
      configIssue: true,
      diagnostic: {
        captureAppUrl: CAPTURE_APP_URL,
        instruction: 'Set CAPTURE_APP_URL environment variable to production capture app endpoint'
      }
    };
  }

  try {
    console.log(`[Fingerprint] Fetching templates for card ${cardId} from ${CAPTURE_APP_URL}`);

    const response = await axios.get(
      `${CAPTURE_APP_URL}/api/printing/fingerprint?cardId=${encodeURIComponent(cardId)}`,
      {
        timeout: 15000,
        headers: { 'X-Api-Key': process.env.VERIFY_API_KEY || '' }
      }
    );

    const payload = response.data || {};
    if (!payload.success) {
      return {
        success: false,
        matched: false,
        message: payload.message || 'Fingerprint record not found'
      };
    }

    const scanned = normalizeFingerprint(scannedFingerprintBase64);
    if (!scanned) {
      return {
        success: false,
        matched: false,
        message: 'Scanned fingerprint is required for verification'
      };
    }

    const fingerprints = payload.fingerprints || payload;
    const templates = [
      fingerprints.left_thumb,
      fingerprints.left_index,
      fingerprints.right_thumb,
      fingerprints.right_index
    ]
      .map(normalizeFingerprint)
      .filter(Boolean);

    const matched = templates.includes(scanned);
    return {
      success: true,
      matched,
      studentName:
        payload.studentName ||
        payload.full_name ||
        [payload.surname, payload.other_names].filter(Boolean).join(' ').trim() ||
        null,
      message: matched ? 'Fingerprint matched' : 'Fingerprint did not match stored templates'
    };
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error(`[Fingerprint] ❌ Connection refused at ${CAPTURE_APP_URL}. Capture app may not be running.`);
      return {
        success: false,
        matched: false,
        message: `Cannot reach capture app at ${CAPTURE_APP_URL}. Fingerprint verification unavailable.`,
        connectionError: true,
        diagnostic: {
          error: 'ECONNREFUSED',
          url: CAPTURE_APP_URL,
          hint: 'Ensure capture app is running and CAPTURE_APP_URL is correct'
        }
      };
    }
    
    if (error.code === 'ETIMEDOUT') {
      console.error(`[Fingerprint] ⏱️  Timeout connecting to capture app at ${CAPTURE_APP_URL}`);
      return {
        success: false,
        matched: false,
        message: `Capture app at ${CAPTURE_APP_URL} is not responding. Please try again.`,
        timeoutError: true
      };
    }
    
    if (error.response) {
      console.error(`[Fingerprint] ❌ Capture app returned ${error.response.status}:`, error.response.data);
      if (error.response.status === 404) {
        return {
          success: false,
          matched: false,
          message: 'Fingerprint record not found for this card'
        };
      }
      return {
        success: false,
        matched: false,
        message: error.response.data?.message || 'Fingerprint verification failed at capture app',
        statusCode: error.response.status,
        appError: error.response.data
      };
    }
    
    console.error('[Fingerprint] Unexpected error:', error.message);
    return {
      success: false,
      matched: false,
      message: `Verification error: ${error.message}`
    };
  }
};

module.exports = {
  syncApprovedCards,
  notifyCardPrinted,
  notifyCardCollected,
  verifyFingerprint,
  ensureQueueExclusionsTable,
  excludeCardFromQueue
};
