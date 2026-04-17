const pool = require('./config/database');

async function check() {
  try {
    const tables = ['approved_cards', 'print_queue', 'id_cards'];
    
    for (const table of tables) {
      const result = await pool.query(
        'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
        [table]
      );
      
      if (result.rows.length === 0) {
        console.log(`✗ ${table}: does not exist`);
      } else {
        console.log(`✓ ${table}: ${result.rows.length} columns`);
        result.rows.forEach(row => {
          console.log(`  - ${row.column_name}: ${row.data_type}`);
        });
      }
      console.log();
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    process.exit(0);
  }
}

check();
