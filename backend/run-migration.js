const pool = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🔄 Starting database migration...\n');
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database-migration-print-collections.sql');
    console.log(`📄 Reading migration file: ${migrationPath}`);
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Split by semicolons to execute statements separately
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comments and empty statements
      if (statement.startsWith('--') || statement.length < 10) {
        continue;
      }
      
      try {
        await pool.query(statement);
        
        // Show progress for CREATE TABLE statements
        if (statement.includes('CREATE TABLE')) {
          const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i)?.[1];
          console.log(`✅ Created table: ${tableName}`);
        }
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists')) {
          const tableName = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i)?.[1];
          console.log(`ℹ️  Table already exists: ${tableName}`);
        } else {
          throw error;
        }
      }
    }
    
    console.log('\n🎉 Migration completed successfully!\n');
    
    // Verify tables were created
    console.log('🔍 Verifying tables...\n');
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('print_queue', 'card_collections', 'print_history', 'scheduling_slots', 'scheduling_bookings')
      ORDER BY table_name
    `);
    
    console.log('Tables found:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });
    
    if (result.rows.length === 5) {
      console.log('\n✅ All required tables are present!');
    } else {
      console.log(`\n⚠️  Warning: Expected 5 tables, found ${result.rows.length}`);
    }
    
    console.log('\n📊 Next steps:');
    console.log('  1. Restart the backend server');
    console.log('  2. Test printing a card');
    console.log('  3. Check Collections tab\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();
