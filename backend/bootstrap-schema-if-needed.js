const fs = require('fs');
const path = require('path');
const pool = require('./config/database');

async function bootstrapSchemaIfNeeded() {
  try {
    const check = await pool.query("SELECT to_regclass('public.users') AS users_table");
    if (check.rows[0]?.users_table) {
      console.log('users table already exists; skipping schema bootstrap');
      process.exit(0);
    }

    const schemaPath = path.join(__dirname, '../database-schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    await pool.query(sql);
    console.log('schema bootstrap completed');
    process.exit(0);
  } catch (error) {
    console.error('bootstrap failed:', error.code || '', error.message);
    process.exit(1);
  }
}

bootstrapSchemaIfNeeded();
