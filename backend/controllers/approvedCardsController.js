const pool = require('../config/database');

// Get all approved cards from local database (permanent history)
const getApprovedCards = async (req, res) => {
  try {
    const { search } = req.query;
    
    let query = `
      SELECT * FROM approved_cards
      WHERE 1=1
    `;
    
    const params = [];

    if (search) {
      query += ` AND (
        surname ILIKE $1 OR 
        other_names ILIKE $1 OR 
        matric_no ILIKE $1 OR 
        staff_id ILIKE $1 OR
        faculty ILIKE $1 OR
        department ILIKE $1 OR
        card_number ILIKE $1
      )`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY approved_at DESC';

    const result = await pool.query(query, params);

    // Convert passport_photo buffer to base64 for frontend
    const cards = result.rows.map(card => ({
      ...card,
      passport_photo: card.passport_photo ? card.passport_photo.toString('base64') : null
    }));

    res.json({
      success: true,
      cards,
      total: cards.length
    });
  } catch (error) {
    console.error('Error fetching approved cards:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching approved cards',
      error: error.message 
    });
  }
};

// Get single approved card by ID
const getApprovedCardById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM approved_cards WHERE card_id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Card not found'
      });
    }

    const card = result.rows[0];
    
    // Convert passport_photo buffer to base64
    if (card.passport_photo) {
      card.passport_photo = card.passport_photo.toString('base64');
    }

    res.json({
      success: true,
      card
    });
  } catch (error) {
    console.error('Error fetching approved card:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching card',
      error: error.message 
    });
  }
};

// Get approved cards statistics
const getApprovedCardsStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_approved,
        COUNT(*) FILTER (WHERE DATE(approved_at) = CURRENT_DATE) as approved_today,
        COUNT(*) FILTER (WHERE DATE(approved_at) >= CURRENT_DATE - INTERVAL '7 days') as approved_this_week,
        COUNT(*) FILTER (WHERE DATE(approved_at) >= CURRENT_DATE - INTERVAL '30 days') as approved_this_month
      FROM approved_cards
    `);

    res.json({
      success: true,
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching approved cards stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching statistics',
      error: error.message 
    });
  }
};

module.exports = {
  getApprovedCards,
  getApprovedCardById,
  getApprovedCardsStats
};
