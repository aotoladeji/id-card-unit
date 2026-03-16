-- ====================================
-- MIGRATION: Add Print Queue and Collections Tables
-- ====================================
-- Run this migration to add the missing tables for print queue and collections

-- ====================================
-- PRINT QUEUE TABLE
-- ====================================
CREATE TABLE IF NOT EXISTS print_queue (
    id SERIAL PRIMARY KEY,
    card_id INTEGER NOT NULL,
    surname VARCHAR(255) NOT NULL,
    other_names VARCHAR(255) NOT NULL,
    matric_no VARCHAR(50),
    staff_id VARCHAR(50),
    faculty VARCHAR(255),
    department VARCHAR(255),
    level VARCHAR(50),
    card_number VARCHAR(50),
    session VARCHAR(50),
    passport_photo TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'printing', 'printed', 'failed')),
    added_to_queue_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    printed_at TIMESTAMP,
    printed_by INTEGER REFERENCES users(id),
    print_attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
CREATE INDEX IF NOT EXISTS idx_print_queue_card_id ON print_queue(card_id);

-- ====================================
-- CARD COLLECTIONS TABLE
-- ====================================
CREATE TABLE IF NOT EXISTS card_collections (
    id SERIAL PRIMARY KEY,
    card_id INTEGER NOT NULL,
    surname VARCHAR(255) NOT NULL,
    other_names VARCHAR(255) NOT NULL,
    matric_no VARCHAR(50),
    staff_id VARCHAR(50),
    faculty VARCHAR(255),
    department VARCHAR(255),
    card_number VARCHAR(50),
    printed_at TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'awaiting_collection'
        CHECK (status IN ('awaiting_collection', 'collected')),
    collected_at TIMESTAMP,
    collected_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_card_collections_status ON card_collections(status);
CREATE INDEX IF NOT EXISTS idx_card_collections_card_id ON card_collections(card_id);
CREATE INDEX IF NOT EXISTS idx_card_collections_matric_no ON card_collections(matric_no);

-- ====================================
-- PRINT HISTORY TABLE
-- ====================================
CREATE TABLE IF NOT EXISTS print_history (
    id SERIAL PRIMARY KEY,
    card_id INTEGER NOT NULL,
    surname VARCHAR(255) NOT NULL,
    other_names VARCHAR(255) NOT NULL,
    matric_no VARCHAR(50),
    staff_id VARCHAR(50),
    card_number VARCHAR(50),
    printed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    printed_by INTEGER REFERENCES users(id),
    printer_name VARCHAR(255),
    print_quality VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_print_history_card_id ON print_history(card_id);
CREATE INDEX IF NOT EXISTS idx_print_history_printed_at ON print_history(printed_at);

-- ====================================
-- SCHEDULING TABLE (for student appointments)
-- ====================================
CREATE TABLE IF NOT EXISTS scheduling_slots (
    id SERIAL PRIMARY KEY,
    slot_date DATE NOT NULL,
    slot_time TIME NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 10,
    booked INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'full', 'closed')),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(slot_date, slot_time)
);

CREATE TABLE IF NOT EXISTS scheduling_bookings (
    id SERIAL PRIMARY KEY,
    slot_id INTEGER NOT NULL REFERENCES scheduling_slots(id) ON DELETE CASCADE,
    student_name VARCHAR(255) NOT NULL,
    matric_number VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    booking_code VARCHAR(50) UNIQUE NOT NULL,
    booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP,
    completed_at TIMESTAMP,
    notes TEXT
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_scheduling_slots_date ON scheduling_slots(slot_date);
CREATE INDEX IF NOT EXISTS idx_scheduling_bookings_matric ON scheduling_bookings(matric_number);
CREATE INDEX IF NOT EXISTS idx_scheduling_bookings_code ON scheduling_bookings(booking_code);

-- ====================================
-- VERIFICATION
-- ====================================
-- Check that all tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('print_queue', 'card_collections', 'print_history', 'scheduling_slots', 'scheduling_bookings')
ORDER BY table_name;

-- Show structure of card_collections table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'card_collections'
ORDER BY ordinal_position;

-- Show structure of print_queue table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'print_queue'
ORDER BY ordinal_position;
