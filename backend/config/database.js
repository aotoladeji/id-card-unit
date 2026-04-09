const { Pool } = require('pg');
if (!process.env.VERCEL) {
  require('dotenv').config();
}

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_PRISMA_URL;

const useDatabaseUrl = Boolean(databaseUrl);

const parseSslFlag = (value) => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on', 'require'].includes(String(value).toLowerCase());
};

const shouldUseSsl = parseSslFlag(process.env.DB_SSL) || parseSslFlag(process.env.PGSSLMODE) || process.env.NODE_ENV === 'production';

const connectionConfig = useDatabaseUrl
  ? {
      connectionString: databaseUrl,
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
  source: useDatabaseUrl ? 'DATABASE_URL/POSTGRES_URL' : 'DB_*',
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  hasConnectionString: Boolean(databaseUrl),
  ssl: shouldUseSsl,
});

const pool = new Pool(connectionConfig);

pool.on('connect', async (client) => {
  const res = await client.query('SELECT current_database(), current_schema()');
  console.log('✅ Connected to:', res.rows[0]);
});

module.exports = pool;
