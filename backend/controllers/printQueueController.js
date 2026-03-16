const pool = require('../config/database');
const { syncApprovedCards, notifyCardPrinted } = require('../services/captureAppIntegration');

// Sync approved cards from capture app
const syncCards = async (req, res) => {
  try {
    const result = await syncApprovedCards();
    
    // Only log if cards were actually synced
    if (result.added > 0) {
      await pool.query(
        'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
        [req.user.id, 'CARDS_SYNCED', `Synced ${result.added} new cards to print queue`]
      );
    }

    res.json({
      success: true,
      message: result.message || `Synced ${result.added} cards`,
      ...result
    });
  } catch (error) {
    console.error('Error syncing cards:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error syncing approved cards',
      error: error.message 
    });
  }
};

// Get print queue
const getPrintQueue = async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT pq.*, u.name as printed_by_name
      FROM print_queue pq
      LEFT JOIN users u ON pq.printed_by = u.id
    `;

    const params = [];
    if (status) {
      query += ' WHERE pq.status = $1';
      params.push(status);
    } else {
      query += ' WHERE pq.status IN ($1, $2)';
      params.push('queued', 'printing');
    }

    query += ' ORDER BY pq.added_to_queue_at ASC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      queue: result.rows
    });
  } catch (error) {
    console.error('Error fetching print queue:', error);
    res.status(500).json({ message: 'Error fetching print queue' });
  }
};

// Mark card as printed (called after successful print)
const markAsPrinted = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { printerName, quality } = req.body;

    console.log(`[Mark as Printed] Starting for queue ID: ${id}`);

    await client.query('BEGIN');

    // Get card details
    const cardResult = await client.query(
      'SELECT * FROM print_queue WHERE id = $1',
      [id]
    );

    if (cardResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.error(`[Mark as Printed] Card not found in queue: ${id}`);
      return res.status(404).json({ message: 'Card not found in queue' });
    }

    const card = cardResult.rows[0];
    console.log(`[Mark as Printed] Found card: ${card.surname} ${card.other_names} (card_id: ${card.card_id})`);

    // Mark as printed in queue
    await client.query(
      `UPDATE print_queue 
       SET status = 'printed', printed_at = CURRENT_TIMESTAMP, printed_by = $1
       WHERE id = $2`,
      [req.user.id, id]
    );
    console.log(`[Mark as Printed] Updated print_queue status`);

    // Add to print history
    await client.query(`
      INSERT INTO print_history 
      (card_id, surname, other_names, matric_no, staff_id, card_number, 
       printed_at, printed_by, printer_name, print_quality)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9)
    `, [
      card.card_id,
      card.surname,
      card.other_names,
      card.matric_no,
      card.staff_id,
      card.card_number,
      req.user.id,
      printerName || 'Default Printer',
      quality || 'standard'
    ]);
    console.log(`[Mark as Printed] Added to print_history`);

    // Add to collection tracking
    await client.query(`
      INSERT INTO card_collections 
      (card_id, surname, other_names, matric_no, staff_id, faculty, department, 
       card_number, printed_at, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, 'awaiting_collection')
    `, [
      card.card_id,
      card.surname,
      card.other_names,
      card.matric_no,
      card.staff_id,
      card.faculty,
      card.department,
      card.card_number
    ]);
    console.log(`[Mark as Printed] Added to card_collections`);

    // Delete from queue (card moves to history and collection)
    await client.query('DELETE FROM print_queue WHERE id = $1', [id]);
    console.log(`[Mark as Printed] Deleted from print_queue`);

    await client.query('COMMIT');
    console.log(`[Mark as Printed] Transaction committed successfully`);

    // Notify capture app (async, don't wait)
    notifyCardPrinted(card.card_id).catch(err => 
      console.error('Failed to notify capture app:', err)
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'CARD_PRINTED', `Printed card for ${card.surname} ${card.other_names}`]
    );

    res.json({
      success: true,
      message: 'Card marked as printed'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Mark as Printed] Error:', error);
    console.error('[Mark as Printed] Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      table: error.table,
      column: error.column
    });
    res.status(500).json({ 
      message: 'Error updating print status',
      error: error.message,
      detail: error.detail
    });
  } finally {
    client.release();
  }
};

// Mark card as failed
const markAsFailed = async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = req.body;

    await pool.query(
      `UPDATE print_queue 
       SET status = 'failed', print_attempts = print_attempts + 1, last_error = $1
       WHERE id = $2`,
      [error || 'Unknown error', id]
    );

    res.json({
      success: true,
      message: 'Card marked as failed'
    });
  } catch (error) {
    console.error('Error marking card as failed:', error);
    res.status(500).json({ message: 'Error updating print status' });
  }
};

// Retry failed card
const retryPrint = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `UPDATE print_queue 
       SET status = 'queued', last_error = NULL
       WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Card queued for retry'
    });
  } catch (error) {
    console.error('Error retrying print:', error);
    res.status(500).json({ message: 'Error retrying print' });
  }
};

// Generate PDF for card
const generatePDF = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM print_queue WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const card = result.rows[0];

    // For now, return a simple response
    // In production, you'd use a library like PDFKit or Puppeteer
    res.json({
      success: true,
      message: 'PDF generation not yet implemented. Use browser print for now.',
      card: {
        name: `${card.surname} ${card.other_names}`,
        id: card.matric_no || card.staff_id
      }
    });

    // TODO: Implement actual PDF generation
    // const PDFDocument = require('pdfkit');
    // const doc = new PDFDocument({ size: [243, 153] }); // ID card size in points
    // ... generate PDF content
    // res.setHeader('Content-Type', 'application/pdf');
    // doc.pipe(res);
    // doc.end();

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Error generating PDF' });
  }
};

// Send to direct printer
const printDirect = async (req, res) => {
  try {
    const { id } = req.params;
    const { printerName } = req.body;

    const result = await pool.query(
      'SELECT * FROM print_queue WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // For now, return a simple response
    // In production, you'd use a library like node-printer or electron-printer
    res.json({
      success: true,
      message: 'Direct printing not yet implemented. Use browser print for now.',
      printerName: printerName || 'Default'
    });

    // TODO: Implement actual direct printing
    // const printer = require('printer');
    // printer.printDirect({
    //   data: generateCardData(card),
    //   printer: printerName,
    //   type: 'RAW',
    //   success: () => { ... },
    //   error: () => { ... }
    // });

  } catch (error) {
    console.error('Error printing directly:', error);
    res.status(500).json({ message: 'Error sending to printer' });
  }
};

// Clear entire print queue
const clearQueue = async (req, res) => {
  try {
    console.log('[Clear Queue] Clearing all cards from print queue...');
    
    // Get count before clearing
    const countResult = await pool.query('SELECT COUNT(*) FROM print_queue');
    const count = parseInt(countResult.rows[0].count);
    
    // Clear the queue
    await pool.query('DELETE FROM print_queue');
    
    console.log(`[Clear Queue] Cleared ${count} cards from queue`);
    
    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'QUEUE_CLEARED', `Cleared ${count} cards from print queue`]
    );

    res.json({
      success: true,
      message: `Cleared ${count} card(s) from print queue`,
      count
    });
  } catch (error) {
    console.error('[Clear Queue] Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error clearing print queue',
      error: error.message 
    });
  }
};

// Delete single card from queue
const deleteCard = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[Delete Card] Removing card ID ${id} from print queue...`);
    
    // Get card details before deleting
    const cardResult = await pool.query(
      'SELECT * FROM print_queue WHERE id = $1',
      [id]
    );

    if (cardResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Card not found in queue' 
      });
    }

    const card = cardResult.rows[0];
    
    // Delete the card
    await pool.query('DELETE FROM print_queue WHERE id = $1', [id]);
    
    console.log(`[Delete Card] Removed: ${card.surname} ${card.other_names}`);
    
    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'CARD_DELETED_FROM_QUEUE', `Deleted ${card.surname} ${card.other_names} from print queue`]
    );

    res.json({
      success: true,
      message: 'Card removed from queue'
    });
  } catch (error) {
    console.error('[Delete Card] Error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting card',
      error: error.message 
    });
  }
};

module.exports = {
  syncCards,
  getPrintQueue,
  markAsPrinted,
  markAsFailed,
  retryPrint,
  generatePDF,
  printDirect,
  clearQueue,
  deleteCard
};