const pool = require('../config/database');

// Get all printed cards with search and date filtering
const getPrintHistory = async (req, res) => {
  try {
    const { search, startDate, endDate, page = 1, limit = 50 } = req.query;
    
    let query = `
      SELECT ph.*, u.name as printed_by_name
      FROM print_history ph
      LEFT JOIN users u ON ph.printed_by = u.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    // Search filter
    if (search) {
      paramCount++;
      query += ` AND (
        ph.surname ILIKE $${paramCount} OR 
        ph.other_names ILIKE $${paramCount} OR 
        ph.matric_no ILIKE $${paramCount} OR 
        ph.card_number ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    // Date filters
    if (startDate) {
      paramCount++;
      query += ` AND ph.printed_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND ph.printed_at <= $${paramCount}`;
      params.push(endDate);
    }

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM (${query}) as filtered`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    const offset = (page - 1) * limit;
    query += ` ORDER BY ph.printed_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      history: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching print history:', error);
    res.status(500).json({ message: 'Error fetching print history' });
  }
};

// Get print statistics
const getPrintStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_printed,
        COUNT(*) FILTER (WHERE DATE(printed_at) = CURRENT_DATE) as printed_today,
        COUNT(*) FILTER (WHERE printed_at >= CURRENT_DATE - INTERVAL '7 days') as printed_this_week,
        COUNT(*) FILTER (WHERE DATE_TRUNC('month', printed_at) = DATE_TRUNC('month', CURRENT_DATE)) as printed_this_month
      FROM print_history
    `);

    res.json({
      success: true,
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching print stats:', error);
    res.status(500).json({ message: 'Error fetching statistics' });
  }
};

module.exports = {
  getPrintHistory,
  getPrintStats
};