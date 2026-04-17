const pool = require('./config/database');

async function addMissingTables() {
  try {
    console.log('Creating missing tables for sync to work...\n');

    // 1. Create approved_cards table (for synced card history from capture app)
    console.log('Creating approved_cards table...');
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ approved_cards created\n');

    // 2. Create print_queue table (for cards queued for printing)
    console.log('Creating print_queue table...');
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ print_queue created\n');

    // 3. Create print_queue_exclusions table (for cards to skip during sync)
    console.log('Creating print_queue_exclusions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS print_queue_exclusions (
        id SERIAL PRIMARY KEY,
        card_id INTEGER UNIQUE,
        reason VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ print_queue_exclusions created\n');

    console.log('✅ All missing tables created successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    process.exit(1);
  }
}

addMissingTables();
