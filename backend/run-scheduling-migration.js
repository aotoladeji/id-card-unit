const pool = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runSchedulingMigration() {
  console.log('🔄 Starting scheduling tables migration...\n');
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database-migration-scheduling.sql');
    console.log(`📄 Reading migration file: ${migrationPath}`);
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 Executing migration script...\n');
    await pool.query(sql);
    
    console.log('\n🎉 Scheduling migration completed successfully!\n');
    
    // Verify tables were created
    console.log('🔍 Verifying tables...\n');
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('scheduling_config', 'scheduled_students', 'time_slots', 'appointments')
      ORDER BY table_name
    `);
    
    console.log('Tables found:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });
    
    if (result.rows.length === 4) {
      console.log('\n✅ All required scheduling tables are present!');
    } else {
      console.log(`\n⚠️  Warning: Expected 4 tables, found ${result.rows.length}`);
    }
    
    console.log('\n📊 Next steps:');
    console.log('  1. Restart the backend server');
    console.log('  2. Test the public scheduling endpoint\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  }
}

// Run the migration
runSchedulingMigration();
