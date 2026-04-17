const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
if (!process.env.VERCEL) {
  dotenv.config();
}

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
const migrationRoutes = require('./routes/admin/migration');
const developerResetRoutes = require('./routes/admin/developerReset');
const diagnosticRoutes = require('./routes/diagnostic');

// Import database connection
const pool = require('./config/database');
const { startDbKeepAlive } = require('./services/dbKeepAlive');

// Create Express app
const app = express();

const normalizeOrigin = (value) => {
  if (!value) return '';

  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, '').toLowerCase();
  }
};

const allowVercelPreviews = String(process.env.CORS_ALLOW_VERCEL_PREVIEWS || '').toLowerCase() === 'true';

const isAllowedVercelPreviewOrigin = (origin) => {
  if (!allowVercelPreviews) {
    return false;
  }

  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
};

const parseAllowedOrigins = () => {
  const explicit = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => normalizeOrigin(origin))
    .filter(Boolean);

  if (explicit.length > 0) {
    return explicit;
  }

  if (process.env.FRONTEND_URL) {
    return [normalizeOrigin(process.env.FRONTEND_URL)];
  }

  return [];
};

const allowedOrigins = parseAllowedOrigins();

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);

    if (
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(normalizedOrigin) ||
      isAllowedVercelPreviewOrigin(normalizedOrigin)
    ) {
      return callback(null, true);
    }

    console.warn(`Blocked CORS origin: ${origin}`);
    return callback(new Error('CORS not allowed from this origin'));
  }
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static('uploads'));

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
app.use('/api/admin/migration', migrationRoutes);
app.use('/api/admin/developer-reset', developerResetRoutes);
app.use('/api/diagnostic', diagnosticRoutes);

// Liveness endpoint (no DB access)
app.get('/api/ping', (req, res) => {
  res.json({
    status: 'OK',
    message: 'API reachable',
    timestamp: new Date().toISOString(),
  });
});

// Health check route — includes DB connectivity and config diagnostics
app.get('/api/health', async (req, res) => {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    '';

  let dbHostHint = process.env.DB_HOST || 'unset';
  if (databaseUrl) {
    try {
      dbHostHint = new URL(databaseUrl).hostname;
    } catch {
      dbHostHint = 'invalid_connection_string';
    }
  }

  const checks = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'undefined',
    jwt_secret: process.env.JWT_SECRET ? 'set' : 'MISSING',
    db_source: databaseUrl ? 'DATABASE_URL/POSTGRES_URL' : 'DB_*',
    db_host_hint: dbHostHint,
    database: null,
    users_table: null,
  };

  try {
    const result = await pool.query('SELECT 1 AS alive');
    checks.database = result.rows.length > 0 ? 'connected' : 'no-response';
  } catch (err) {
    checks.database = `error: ${err.code || err.message}`;
    checks.status = 'DEGRADED';
  }

  try {
    await pool.query('SELECT 1 FROM users LIMIT 1');
    checks.users_table = 'exists';
  } catch (err) {
    checks.users_table = `error: ${err.code || err.message}`;
    if (checks.status === 'OK') checks.status = 'DEGRADED';
  }

  const statusCode = checks.status === 'OK' ? 200 : 503;
  res.status(statusCode).json(checks);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      message: 'Request payload too large. Please recapture and retry fingerprint scan.',
      error: 'PAYLOAD_TOO_LARGE'
    });
  }

  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start server (only when run directly, not when loaded by Vercel serverless)
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  const stopDbKeepAlive = startDbKeepAlive(pool);

  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  });

  process.once('SIGINT', stopDbKeepAlive);
  process.once('SIGTERM', stopDbKeepAlive);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});

module.exports = app;