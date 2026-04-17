if (!process.env.VERCEL) {
  require('dotenv').config();
}

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_PRISMA_URL;

const dbHostLooksLikeUrl = ['postgres://', 'postgresql://'].some(prefix =>
  String(process.env.DB_HOST || '').toLowerCase().startsWith(prefix)
);

const resolvedDatabaseUrl = databaseUrl || (dbHostLooksLikeUrl ? process.env.DB_HOST : '');

const useDatabaseUrl = Boolean(resolvedDatabaseUrl);
const prefersNeonServerless = String(process.env.NEON_HTTP_DRIVER || 'true').toLowerCase() !== 'false';
const isNeonConnection = /neon\.tech/i.test(resolvedDatabaseUrl || process.env.DB_HOST || '');
const useNeonServerless = useDatabaseUrl && isNeonConnection && prefersNeonServerless;

const parseSslFlag = (value) => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on', 'require'].includes(String(value).toLowerCase());
};

const shouldUseSsl = parseSslFlag(process.env.DB_SSL) || parseSslFlag(process.env.PGSSLMODE) || process.env.NODE_ENV === 'production';

let Pool;
if (useNeonServerless) {
  const serverless = require('@neondatabase/serverless');
  const ws = require('ws');
  serverless.neonConfig.webSocketConstructor = ws;
  Pool = serverless.Pool;
} else {
  Pool = require('pg').Pool;
}

const connectionConfig = useDatabaseUrl
  ? {
      connectionString: resolvedDatabaseUrl,
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
  source: databaseUrl ? 'DATABASE_URL/POSTGRES_URL' : dbHostLooksLikeUrl ? 'DB_HOST(connection-string)' : 'DB_*',
  driver: useNeonServerless ? 'neon-serverless(ws)' : 'pg(tcp)',
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  hasConnectionString: Boolean(resolvedDatabaseUrl),
  ssl: shouldUseSsl,
});

const pool = new Pool(connectionConfig);

pool.on('connect', async (client) => {
  const res = await client.query('SELECT current_database(), current_schema()');
  console.log('✅ Connected to:', res.rows[0]);
});

module.exports = pool;
