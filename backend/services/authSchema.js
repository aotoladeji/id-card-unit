const pool = require('../config/database');

let bootstrapPromise = null;
let authSchemaReady = false;

const hasTable = async (tableName) => {
  const result = await pool.query('SELECT to_regclass($1) AS table_ref', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_ref);
};

const getUsersColumns = async () => {
  const result = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
  `);
  return new Set(result.rows.map((row) => row.column_name));
};

const ensureUsersTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      staff_id VARCHAR(50) UNIQUE NOT NULL,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'supervisor', 'staff')),
      permissions TEXT[],
      must_change_password BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const ensureUsersColumns = async () => {
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT[]");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
};

const ensureActivityLogsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      action VARCHAR(255) NOT NULL,
      details TEXT,
      ip_address VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const ensureDefaultAdmin = async () => {
  await pool.query(
    `INSERT INTO users (name, staff_id, username, password, role, permissions, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (username) DO NOTHING`,
    [
      'System Administrator',
      'ADMIN001',
      'MIS001',
      '$2b$10$VBGKICOAtwnPnNSM55e2S.5I3Q73V.TsEukiwJqsk.sWzutSjpvMq',
      'admin',
      ['all'],
      true,
    ]
  );
};

const ensureAuthSchema = async () => {
  if (authSchemaReady) {
    return;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const usersTableExists = await hasTable('users');
      const activityLogsExists = await hasTable('activity_logs');

      if (!usersTableExists || !activityLogsExists) {
        console.log('Auth schema missing core tables; applying auth bootstrap DDL');
        await ensureUsersTable();
        await ensureActivityLogsTable();
      }

      const usersColumns = usersTableExists ? await getUsersColumns() : null;
      const missingUsersColumns = usersColumns
        ? !usersColumns.has('permissions') ||
          !usersColumns.has('must_change_password') ||
          !usersColumns.has('created_at') ||
          !usersColumns.has('updated_at')
        : true;

      if (missingUsersColumns) {
        console.log('Auth schema missing users columns; applying users table backfill');
        await ensureUsersColumns();
      }

      await ensureDefaultAdmin();
      authSchemaReady = true;
    })().finally(() => {
      bootstrapPromise = null;
    });
  }

  return bootstrapPromise;
};

module.exports = { ensureAuthSchema };