const { Pool } = require('pg');
require('dotenv').config();

const useDatabaseUrl = Boolean(process.env.DATABASE_URL);

const parseSslFlag = (value) => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on', 'require'].includes(String(value).toLowerCase());
};

const shouldUseSsl = parseSslFlag(process.env.DB_SSL) || parseSslFlag(process.env.PGSSLMODE) || process.env.NODE_ENV === 'production';

const connectionConfig = useDatabaseUrl
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
    };

console.log('🔎 DB CONFIG:', {
  source: useDatabaseUrl ? 'DATABASE_URL' : 'DB_*',
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  ssl: shouldUseSsl,
});

const pool = new Pool(connectionConfig);

pool.on('connect', async (client) => {
  const res = await client.query('SELECT current_database(), current_schema()');
  console.log('✅ Connected to:', res.rows[0]);
});

module.exports = pool;
