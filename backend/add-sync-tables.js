const pool = require('./config/database');

async function addMissingTables() {
  try {
    console.log('Repairing print/sync schema...\n');

    // 1. Create approved_cards table (history of approved cards pulled from capture app)
    console.log('Ensuring approved_cards table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approved_cards (
        id SERIAL PRIMARY KEY,
        card_id INTEGER UNIQUE,
        surname VARCHAR(255),
        other_names VARCHAR(255),
        matric_no VARCHAR(255),
        staff_id VARCHAR(255),
        faculty VARCHAR(255),
        department VARCHAR(255),
        level VARCHAR(50),
        card_number VARCHAR(255),
        session VARCHAR(50),
        passport_photo BYTEA,
        approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        synced_from_capture_app_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE approved_cards ADD COLUMN IF NOT EXISTS synced_from_capture_app_at TIMESTAMP`);
    await pool.query(`ALTER TABLE approved_cards ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    console.log('✓ approved_cards ready\n');

    // 2. Create print_queue table (cards awaiting print)
    console.log('Ensuring print_queue table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS print_queue (
        id SERIAL PRIMARY KEY,
        card_id INTEGER,
        surname VARCHAR(255),
        other_names VARCHAR(255),
        matric_no VARCHAR(255),
        staff_id VARCHAR(255),
        faculty VARCHAR(255),
        department VARCHAR(255),
        level VARCHAR(50),
        card_number VARCHAR(255),
        session VARCHAR(50),
        passport_photo BYTEA,
        status VARCHAR(50) DEFAULT 'queued' CHECK (status IN ('queued', 'printing', 'printed', 'failed')),
        printed_by INTEGER REFERENCES users(id),
        added_to_queue_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        printed_at TIMESTAMP,
        print_attempts INTEGER DEFAULT 0,
        last_error TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE print_queue ADD COLUMN IF NOT EXISTS print_attempts INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE print_queue ADD COLUMN IF NOT EXISTS last_error TEXT`);
    await pool.query(`ALTER TABLE print_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    console.log('✓ print_queue ready\n');

    // 3. Create print_queue_exclusions table (cards excluded from auto-sync queue)
    console.log('Ensuring print_queue_exclusions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS print_queue_exclusions (
        id SERIAL PRIMARY KEY,
        card_id INTEGER UNIQUE,
        reason VARCHAR(255),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE print_queue_exclusions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)`);
    console.log('✓ print_queue_exclusions ready\n');

    // 4. Create print_history table (used by /api/print-history)
    console.log('Ensuring print_history table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS print_history (
        id SERIAL PRIMARY KEY,
        card_id INTEGER NOT NULL,
        surname VARCHAR(255) NOT NULL,
        other_names VARCHAR(255) NOT NULL,
        matric_no VARCHAR(50),
        staff_id VARCHAR(50),
        card_number VARCHAR(50),
        printed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        printed_by INTEGER REFERENCES users(id),
        printer_name VARCHAR(255),
        print_quality VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ print_history ready\n');

    // 5. Create card_collections table (used by /api/collections)
    console.log('Ensuring card_collections table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS card_collections (
        id SERIAL PRIMARY KEY,
        card_id INTEGER NOT NULL,
        surname VARCHAR(255) NOT NULL,
        other_names VARCHAR(255) NOT NULL,
        matric_no VARCHAR(50),
        staff_id VARCHAR(50),
        faculty VARCHAR(255),
        department VARCHAR(255),
        card_number VARCHAR(50),
        printed_at TIMESTAMP NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'awaiting_collection'
          CHECK (status IN ('awaiting_collection', 'collected')),
        collected_at TIMESTAMP,
        collected_by INTEGER REFERENCES users(id),
        notes TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE card_collections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
    console.log('✓ card_collections ready\n');

    // Helpful indexes (safe to run repeatedly)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_print_queue_card_id ON print_queue(card_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_print_history_card_id ON print_history(card_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_print_history_printed_at ON print_history(printed_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_card_collections_status ON card_collections(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_card_collections_card_id ON card_collections(card_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_card_collections_matric_no ON card_collections(matric_no)`);

    console.log('✅ Schema repair complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error repairing schema:', error.message);
    process.exit(1);
  }
}

addMissingTables();
