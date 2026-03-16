-- ====================================
-- MIGRATION: Add Approved Cards History Table
-- ====================================
-- This table stores ALL approved cards permanently for history and reprint purposes

CREATE TABLE IF NOT EXISTS approved_cards (
    id SERIAL PRIMARY KEY,
    card_id INTEGER UNIQUE NOT NULL,
    surname VARCHAR(255) NOT NULL,
    other_names VARCHAR(255) NOT NULL,
    matric_no VARCHAR(50),
    staff_id VARCHAR(50),
    faculty VARCHAR(255),
    department VARCHAR(255),
    level VARCHAR(50),
    card_number VARCHAR(50),
    session VARCHAR(50),
    passport_photo BYTEA,
    approved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    synced_from_capture_app_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_approved_cards_card_id ON approved_cards(card_id);
CREATE INDEX IF NOT EXISTS idx_approved_cards_matric_no ON approved_cards(matric_no);
CREATE INDEX IF NOT EXISTS idx_approved_cards_staff_id ON approved_cards(staff_id);
CREATE INDEX IF NOT EXISTS idx_approved_cards_surname ON approved_cards(surname);
CREATE INDEX IF NOT EXISTS idx_approved_cards_approved_at ON approved_cards(approved_at);

-- ====================================
-- VERIFICATION
-- ====================================
SELECT 'approved_cards table created successfully' AS status;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'approved_cards'
ORDER BY ordinal_position;
