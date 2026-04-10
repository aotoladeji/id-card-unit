const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Student login for scheduling
router.post('/login', async (req, res) => {
  try {
    const { configId, studentId, loginCode } = req.body;

    if (!configId || !studentId || !loginCode) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if config is active and not closed
    const configResult = await pool.query(
      'SELECT * FROM scheduling_config WHERE id = $1 AND is_active = true AND is_closed = false',
      [configId]
    );

    if (configResult.rows.length === 0) {
      return res.status(404).json({ message: 'Scheduling is not available or has been closed' });
    }

    // Find student — login_code is NULL after booking (one-time use)
    const studentResult = await pool.query(
      `SELECT * FROM scheduled_students 
       WHERE config_id = $1 
       AND (jamb_number = $2 OR pg_reg_number = $2)
       AND login_code = $3`,
      [configId, studentId, loginCode]
    );

    if (studentResult.rows.length === 0) {
      // Check if code was already used (student exists but code is null/different)
      const usedCheck = await pool.query(
        `SELECT has_scheduled FROM scheduled_students
         WHERE config_id = $1 AND (jamb_number = $2 OR pg_reg_number = $2) AND login_code IS NULL`,
        [configId, studentId]
      );
      if (usedCheck.rows.length > 0) {
        return res.status(401).json({ message: 'Your login code has already been used. Appointment is already booked.' });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const student = studentResult.rows[0];

    // Check if already scheduled
    const appointmentResult = await pool.query(
      'SELECT * FROM appointments WHERE student_id = $1',
      [student.id]
    );

    res.json({
      success: true,
      student: {
        id: student.id,
        fullName: student.full_name,
        email: student.email,
        faculty: student.faculty,
        department: student.department,
        level: student.level,
        hasScheduled: student.has_scheduled,
        appointment: appointmentResult.rows[0] || null
      },
      config: configResult.rows[0]
    });
  } catch (error) {
    console.error('Error in student login:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get available slots for a student
router.get('/:configId/available-slots', async (req, res) => {
  try {
    const { configId } = req.params;

    const slots = await pool.query(`
      SELECT * FROM time_slots
      WHERE config_id = $1 
        AND is_available = true 
        AND booked < capacity
        AND slot_date >= CURRENT_DATE
      ORDER BY slot_date, slot_time
    `, [configId]);

    // Group by date
    const slotsByDate = {};
    slots.rows.forEach(slot => {
      const dateKey = slot.slot_date.toISOString().split('T')[0];
      if (!slotsByDate[dateKey]) {
        slotsByDate[dateKey] = [];
      }
      slotsByDate[dateKey].push(slot);
    });

    res.json({
      success: true,
      slots: slotsByDate
    });
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({ message: 'Error fetching available slots' });
  }
});

// Book appointment
router.post('/book', async (req, res) => {
  const { studentId, slotId, configId } = req.body;
  const parsedStudentId = Number.parseInt(studentId, 10);
  const parsedSlotId = Number.parseInt(slotId, 10);
  const parsedConfigId = Number.parseInt(configId, 10);

  if (!Number.isInteger(parsedStudentId) || !Number.isInteger(parsedSlotId) || !Number.isInteger(parsedConfigId)) {
    return res.status(400).json({ message: 'Invalid booking request payload' });
  }

  let client;
  try {
    client = await pool.connect();

    await client.query('BEGIN');

    const configResult = await client.query(
      'SELECT id, is_active, is_closed FROM scheduling_config WHERE id = $1',
      [parsedConfigId]
    );

    if (configResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Scheduling configuration not found' });
    }

    if (!configResult.rows[0].is_active || configResult.rows[0].is_closed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Scheduling is not available for booking' });
    }

    const studentResult = await client.query(
      'SELECT id, config_id, has_scheduled FROM scheduled_students WHERE id = $1',
      [parsedStudentId]
    );

    if (studentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Student not found for this booking' });
    }

    if (studentResult.rows[0].config_id !== parsedConfigId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Student does not belong to this schedule' });
    }

    if (studentResult.rows[0].has_scheduled) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'You already have an appointment scheduled' });
    }

    // Check if student already has appointment
    const existingAppt = await client.query(
      'SELECT * FROM appointments WHERE student_id = $1',
      [parsedStudentId]
    );

    if (existingAppt.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'You already have an appointment scheduled' });
    }

    // Check slot availability
    const slot = await client.query(
      `SELECT * FROM time_slots
       WHERE id = $1
         AND config_id = $2
         AND booked < capacity
       FOR UPDATE`,
      [parsedSlotId, parsedConfigId]
    );

    if (slot.rows.length === 0 || slot.rows[0].booked >= slot.rows[0].capacity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This slot is no longer available' });
    }

    // Create appointment
    const appointment = await client.query(
      `INSERT INTO appointments 
       (config_id, student_id, slot_id, appointment_date, appointment_time)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id) DO NOTHING
       RETURNING *`,
      [parsedConfigId, parsedStudentId, parsedSlotId, slot.rows[0].slot_date, slot.rows[0].slot_time]
    );

    if (appointment.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'You already have an appointment scheduled' });
    }

    // Update slot booking count
    await client.query(
      'UPDATE time_slots SET booked = booked + 1 WHERE id = $1',
      [parsedSlotId]
    );

    // Update student status and invalidate login code (one-time use)
    const studentUpdate = await client.query(
      `UPDATE scheduled_students 
       SET has_scheduled = true, scheduled_date = $1, scheduled_time = $2,
           login_code = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [slot.rows[0].slot_date, slot.rows[0].slot_time, parsedStudentId]
    );

    if (studentUpdate.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Student not found for this booking' });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Appointment booked successfully',
      appointment: appointment.rows[0]
    });
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Error booking appointment:', error);

    if (error.code === '23503') {
      return res.status(400).json({ message: 'Invalid booking reference data' });
    }

    if (error.code === '23505') {
      return res.status(409).json({ message: 'Appointment already exists for this student' });
    }

    if (error.code === '22P02') {
      return res.status(400).json({ message: 'Invalid booking identifiers provided' });
    }

    res.status(500).json({
      message: 'Error booking appointment',
      code: error.code || 'UNKNOWN_ERROR'
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Cancel appointment
router.post('/cancel', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { studentId } = req.body;

    await client.query('BEGIN');

    // Get appointment
    const appt = await client.query(
      'SELECT * FROM appointments WHERE student_id = $1',
      [studentId]
    );

    if (appt.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No appointment found' });
    }

    const appointment = appt.rows[0];

    // Update slot
    await client.query(
      'UPDATE time_slots SET booked = booked - 1 WHERE id = $1',
      [appointment.slot_id]
    );

    // Update student
    await client.query(
      `UPDATE scheduled_students 
       SET has_scheduled = false, scheduled_date = NULL, scheduled_time = NULL
       WHERE id = $1`,
      [studentId]
    );

    // Delete appointment
    await client.query(
      'DELETE FROM appointments WHERE id = $1',
      [appointment.id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Appointment cancelled successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ message: 'Error cancelling appointment' });
  } finally {
    client.release();
  }
});

module.exports = router;