require('dotenv').config();
const pool = require('./config/database');
const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
  try {
    console.log('🔄 Running Approved Cards Migration...\n');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '..', 'database-migration-approved-cards.sql');
    const sql = await fs.readFile(migrationPath, 'utf8');
    
    // Execute the migration
    await pool.query(sql);
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify the table was created
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'approved_cards'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 approved_cards table structure:');
    result.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('\n✅ approved_cards table is ready!\n');
    
    await pool.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
