const pool = require('./config/database');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS query_message TEXT');
    await client.query('ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS query_reply TEXT');
    await client.query('ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS queried_by INTEGER REFERENCES users(id)');
    await client.query('ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS queried_at TIMESTAMP');
    await client.query('ALTER TABLE material_requests ADD COLUMN IF NOT EXISTS query_replied_at TIMESTAMP');
    console.log('✅ Query columns added');

    await client.query('ALTER TABLE material_requests DROP CONSTRAINT IF EXISTS material_requests_status_check');
    await client.query(`ALTER TABLE material_requests ADD CONSTRAINT material_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled', 'queried'))`);
    console.log('✅ Status constraint updated (added "queried")');
    console.log('✅ Migration complete');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();
