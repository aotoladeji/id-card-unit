const pool = require('./config/database');
const fs = require('fs');
const path = require('path');

const parseStatements = (sqlText) => {
  const withoutLineComments = sqlText
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return withoutLineComments
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
};

async function runSchedulingMigration() {
  console.log('🔄 Starting scheduling tables migration...\n');
  
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../database-migration-scheduling.sql');
    console.log(`📄 Reading migration file: ${migrationPath}`);
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    const statements = parseStatements(sql);
    
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
        } else if (statement.includes('CREATE INDEX')) {
          const indexName = statement.match(/CREATE INDEX (?:IF NOT EXISTS )?(\w+)/i)?.[1];
          console.log(`✅ Created index: ${indexName}`);
        }
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists')) {
          const match = statement.match(/CREATE (?:TABLE|INDEX) (?:IF NOT EXISTS )?(\w+)/i);
          const name = match?.[1];
          console.log(`ℹ️  Already exists: ${name}`);
        } else {
          throw error;
        }
      }
    }
    
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
