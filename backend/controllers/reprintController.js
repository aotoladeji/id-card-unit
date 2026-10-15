const pool = require('../config/database');
const { ensureQueueExclusionsTable } = require('../services/captureAppIntegration');

// Return an approved reprint card to the print queue.
// Looked up by matric number (or staff id) since reprint requests only store the ID number.
const addApprovedCardToQueue = async (matricNumber, userId) => {
  await ensureQueueExclusionsTable();

  const cardResult = await pool.query(
    `SELECT * FROM approved_cards
     WHERE matric_no = $1 OR staff_id = $1
     ORDER BY approved_at DESC
     LIMIT 1`,
    [matricNumber]
  );

  if (cardResult.rows.length === 0) {
    return { queued: false, reason: 'card_not_found' };
  }

  const card = cardResult.rows[0];

  const existingQueue = await pool.query(
    'SELECT id FROM print_queue WHERE card_id = $1 LIMIT 1',
    [card.card_id]
  );

  if (existingQueue.rows.length > 0) {
    return { queued: true, alreadyQueued: true, card };
  }

  // Reprints are deliberate re-queues, so clear any prior exclusion (e.g. from a previous print).
  await pool.query('DELETE FROM print_queue_exclusions WHERE card_id = $1', [card.card_id]);

  const passportBuffer = card.passport_photo ? Buffer.from(card.passport_photo) : null;

  await pool.query(
    `INSERT INTO print_queue
     (card_id, surname, other_names, matric_no, staff_id, faculty, department,
      level, card_number, session, passport_photo, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'queued')`,
    [
      card.card_id,
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
    ]
  );

  await pool.query(
    'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
    [
      userId,
      'CARD_ADDED_TO_QUEUE',
      `Approved reprint returned to print queue: ${card.surname} ${card.other_names} (${matricNumber})`
    ]
  );

  return { queued: true, alreadyQueued: false, card };
};

// Get all reprint requests
const getAllReprintRequests = async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT 
        r.*,
        u1.username as requested_by_username,
        u2.username as resolved_by_username
      FROM reprint_requests r
      LEFT JOIN users u1 ON r.requested_by = u1.id
      LEFT JOIN users u2 ON r.resolved_by = u2.id
    `;

    const params = [];

    if (status) {
      query += ' WHERE r.status = $1';
      params.push(status);
    }

    query += ' ORDER BY r.created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      requests: result.rows
    });
  } catch (error) {
    console.error('Error fetching reprint requests:', error);
    res.status(500).json({ message: 'Error fetching reprint requests' });
  }
};

// Create new reprint request
const createReprintRequest = async (req, res) => {
  try {
    const { matricNumber, studentName, reason } = req.body;

    const result = await pool.query(
      `INSERT INTO reprint_requests 
       (matric_number, student_name, reason, requested_by, status) 
       VALUES ($1, $2, $3, $4, 'pending') 
       RETURNING *`,
      [matricNumber, studentName, reason, req.user.id]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'REPRINT_REQUEST_CREATED', `Reprint request for ${matricNumber}`]
    );

    res.status(201).json({
      success: true,
      message: 'Reprint request created successfully',
      request: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating reprint request:', error);
    res.status(500).json({ message: 'Error creating reprint request' });
  }
};

// Approve/Reject reprint request
const updateReprintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const result = await pool.query(
      `UPDATE reprint_requests 
       SET status = $1, notes = $2, resolved_by = $3, resolved_at = CURRENT_TIMESTAMP 
       WHERE id = $4 
       RETURNING *`,
      [status, notes, req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    const request = result.rows[0];

    // Approved reprints should go straight back to the print queue.
    let queueResult = null;
    if (status === 'approved') {
      queueResult = await addApprovedCardToQueue(request.matric_number, req.user.id);
      if (!queueResult.queued) {
        console.warn(
          `[Reprint] Approved request ${id} could not be queued: card ${request.matric_number} not found in approved_cards`
        );
      }
    }

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'REPRINT_REQUEST_' + status.toUpperCase(), `Request ID: ${id}`]
    );

    let message = `Request ${status} successfully`;
    if (queueResult?.queued) {
      message = queueResult.alreadyQueued
        ? 'Request approved - card is already in the print queue'
        : 'Request approved - card returned to print queue';
    } else if (status === 'approved') {
      message = 'Request approved, but the card was not found in approved cards and could not be queued';
    }

    res.json({
      success: true,
      message,
      queued: queueResult?.queued || false,
      request
    });
  } catch (error) {
    console.error('Error updating reprint request:', error);
    res.status(500).json({ message: 'Error updating reprint request' });
  }
};

module.exports = {
  getAllReprintRequests,
  createReprintRequest,
  updateReprintStatus
};