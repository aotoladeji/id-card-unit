-- ====================================
-- SCHEDULING TABLES MIGRATION
-- ====================================

-- Create scheduling configuration table
CREATE TABLE IF NOT EXISTS scheduling_config (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'appointment',
    slots_per_period INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    is_closed BOOLEAN DEFAULT FALSE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    daily_start_time TIME NOT NULL DEFAULT '09:00:00',
    daily_end_time TIME NOT NULL DEFAULT '17:00:00',
    exclude_weekends BOOLEAN DEFAULT TRUE,
    location TEXT,
    important_message TEXT,
    slots_per_day INTEGER DEFAULT 8,
    max_capacity INTEGER DEFAULT 1000,
    default_slot_capacity INTEGER DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- Create scheduled students table
CREATE TABLE IF NOT EXISTS scheduled_students (
    id SERIAL PRIMARY KEY,
    config_id INTEGER NOT NULL REFERENCES scheduling_config(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    jamb_number VARCHAR(50),
    pg_reg_number VARCHAR(50),
    faculty VARCHAR(255),
    department VARCHAR(255),
    level VARCHAR(50),
    login_code VARCHAR(6),
    email_sent BOOLEAN DEFAULT FALSE,
    has_scheduled BOOLEAN DEFAULT FALSE,
    scheduled_date DATE,
    scheduled_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_student_per_config UNIQUE (config_id, jamb_number, pg_reg_number)
);

-- Create time slots table
CREATE TABLE IF NOT EXISTS time_slots (
    id SERIAL PRIMARY KEY,
    config_id INTEGER NOT NULL REFERENCES scheduling_config(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    slot_time TIME NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 5,
    booked INTEGER DEFAULT 0,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_slot CHECK (booked <= capacity),
    CONSTRAINT unique_slot UNIQUE (config_id, slot_date, slot_time)
);

-- Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    config_id INTEGER NOT NULL REFERENCES scheduling_config(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES scheduled_students(id) ON DELETE CASCADE,
    slot_id INTEGER NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no-show')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_student_appointment UNIQUE (student_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_scheduled_students_config_id ON scheduled_students(config_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_students_jamb ON scheduled_students(jamb_number);
CREATE INDEX IF NOT EXISTS idx_scheduled_students_pg_reg ON scheduled_students(pg_reg_number);
CREATE INDEX IF NOT EXISTS idx_time_slots_config_id ON time_slots(config_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_date ON time_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_appointments_config_id ON appointments(config_id);
CREATE INDEX IF NOT EXISTS idx_appointments_student_id ON appointments(student_id);
CREATE INDEX IF NOT EXISTS idx_appointments_slot_id ON appointments(slot_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);

-- Backfill missing columns for environments where the first scheduling migration already ran
ALTER TABLE scheduling_config ADD COLUMN IF NOT EXISTS slots_per_period INTEGER DEFAULT 0;
ALTER TABLE scheduling_config ADD COLUMN IF NOT EXISTS exclude_weekends BOOLEAN DEFAULT TRUE;
ALTER TABLE scheduling_config ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE scheduling_config ADD COLUMN IF NOT EXISTS important_message TEXT;

ALTER TABLE scheduled_students ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE scheduled_students ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;
