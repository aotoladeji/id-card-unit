const pool = require('./config/database');

async function clearQueue() {
  console.log('🗑️  Clearing Print Queue\n');

  try {
    // Get count before clearing
    const countResult = await pool.query('SELECT COUNT(*) FROM print_queue');
    const count = parseInt(countResult.rows[0].count);

    if (count === 0) {
      console.log('ℹ️  Print queue is already empty\n');
      process.exit(0);
    }

    console.log(`Found ${count} card(s) in queue\n`);

    // Show what's in the queue
    const cardsResult = await pool.query(`
      SELECT id, card_id, surname, other_names, status 
      FROM print_queue 
      ORDER BY added_to_queue_at DESC 
      LIMIT 5
    `);

    console.log('Cards in queue:');
    cardsResult.rows.forEach(card => {
      console.log(`  - ${card.surname} ${card.other_names} (ID: ${card.card_id}, Status: ${card.status})`);
    });

    if (count > 5) {
      console.log(`  ... and ${count - 5} more`);
    }

    console.log('\n⚠️  Are you sure you want to clear ALL cards from the queue?');
    console.log('This will delete all records from print_queue table.\n');

    // In a real scenario, you'd want confirmation
    // For now, we'll just clear it
    await pool.query('DELETE FROM print_queue');

    console.log(`✅ Cleared ${count} card(s) from print queue\n`);
    console.log('You can now run: node test-sync.js to sync fresh cards\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing queue:', error.message);
    console.error('\nPossible causes:');
    console.error('  1. Database not connected');
    console.error('  2. print_queue table does not exist (run: node run-migration.js)\n');
    process.exit(1);
  }
}

clearQueue();
