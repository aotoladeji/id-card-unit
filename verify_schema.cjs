const { ensureSchedulingSchema } = require('./backend/services/schedulingSchema.js');
const pool = require('./backend/config/database');

async function run() {
  try {
    console.log('Calling ensureSchedulingSchema...');
    await ensureSchedulingSchema();
    console.log('ensureSchedulingSchema finished.');

    const result = await pool.query(
      'SELECT ' +
      'to_regclass(\\'public.scheduling_config\\') AS scheduling_config, ' +
      'to_regclass(\\'public.scheduled_students\\') AS scheduled_students, ' +
      'to_regclass(\\'public.time_slots\\') AS time_slots, ' +
      'to_regclass(\\'public.appointments\\') AS appointments'
    );

    console.log('Table exists check results:');
    console.log(JSON.stringify(result.rows[0], null, 2));

    const requiredTables = [
      'scheduling_config',
      'scheduled_students',
      'time_slots',
      'appointments',
    ];

    const missing = requiredTables.filter(t => !result.rows[0][t]);
    if (missing.length === 0) {
      console.log('All tables verified.');
    } else {
      console.log('Missing tables:', missing);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
