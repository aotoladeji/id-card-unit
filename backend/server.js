const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const cardsRoutes = require('./routes/cards');
const logsRoutes = require('./routes/logs');
const reprintRoutes = require('./routes/reprint');
const materialRoutes = require('./routes/material');
const dailyReportsRoutes = require('./routes/dailyReports');
const inventoryRoutes = require('./routes/inventory');
const schedulingRoutes = require('./routes/scheduling');
const publicSchedulingRoutes = require('./routes/publicScheduling');
const printQueueRoutes = require('./routes/printQueue');
const printHistoryRoutes = require('./routes/printHistory');
const collectionsRoutes = require('./routes/collections');
const cardImageRoutes = require('./routes/captureAppCardImage');
const cardPreviewRoutes = require('./routes/cardPreview');
const approvedCardsRoutes = require('./routes/approvedCards');

// Import database connection
const pool = require('./config/database');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
app.use('/uploads', express.static('uploads'));

// Add this before your other routes
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    const dailyReportsColumns = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'daily_reports'
      ORDER BY ordinal_position
    `);
    
    res.json({
      database_connected: true,
      current_time: result.rows[0],
      tables: tablesResult.rows,
      daily_reports_columns: dailyReportsColumns.rows
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/card-images', cardImageRoutes);
app.use('/api/card-preview', cardPreviewRoutes);
app.use('/api/approved-cards', approvedCardsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/reprint', reprintRoutes);
app.use('/api/material', materialRoutes);
app.use('/api/daily-reports', dailyReportsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/public/scheduling', publicSchedulingRoutes);
app.use('/api/print-queue', printQueueRoutes);
app.use('/api/print-history', printHistoryRoutes);
app.use('/api/collections', collectionsRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});