-- ====================================
-- FULL DATABASE HARD RESET (FIXED)
-- ====================================

-- DROP EVERYTHING
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS daily_reports CASCADE;
DROP TABLE IF EXISTS material_requests CASCADE;
DROP TABLE IF EXISTS faulty_deliveries CASCADE;
DROP TABLE IF EXISTS reprint_requests CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS id_cards CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ====================================
-- USERS
-- ====================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    staff_id VARCHAR(50) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'supervisor', 'staff')),
    permissions TEXT[],
    must_change_password BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- ID CARDS
-- ====================================
CREATE TABLE id_cards (
    id SERIAL PRIMARY KEY,
    matric_number VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    faculty VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    level VARCHAR(50) NOT NULL,
    photo_url TEXT,
    signature_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'printed', 'collected', 'rejected')),
    captured_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    printed_by INTEGER REFERENCES users(id),
    collected_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- INVENTORY
-- ====================================
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    last_restocked TIMESTAMP,
    added_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- REPRINT REQUESTS
-- ====================================
CREATE TABLE reprint_requests (
    id SERIAL PRIMARY KEY,
    matric_number VARCHAR(50) NOT NULL,
    student_name VARCHAR(255) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    requested_by INTEGER REFERENCES users(id),
    resolved_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- ====================================
-- MATERIAL REQUESTS
-- ====================================
CREATE TABLE material_requests (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    urgency VARCHAR(50) NOT NULL DEFAULT 'normal'
        CHECK (urgency IN ('normal', 'high', 'urgent')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled')),
    requested_by INTEGER REFERENCES users(id),
    responded_by INTEGER REFERENCES users(id),
    response_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP
);

-- ====================================
-- FAULTY DELIVERIES
-- ====================================
CREATE TABLE faulty_deliveries (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    issue_description TEXT NOT NULL,
    reported_by INTEGER REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'acknowledged', 'resolved')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_notes TEXT
);

-- ====================================
-- DAILY REPORTS (FIXED)
-- ====================================
CREATE TABLE daily_reports (
    id SERIAL PRIMARY KEY,
    report_date DATE NOT NULL,
    cards_captured INTEGER DEFAULT 0,
    cards_approved INTEGER DEFAULT 0,
    cards_printed INTEGER DEFAULT 0,
    cards_collected INTEGER DEFAULT 0,
    issues_encountered TEXT,
    submitted_by INTEGER NOT NULL REFERENCES users(id),
    verified_by INTEGER REFERENCES users(id),
    verification_status VARCHAR(50) NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    supervisor_remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP
);

-- ====================================
-- ACTIVITY LOGS
-- ====================================
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================
-- DEFAULT ADMIN USER
-- ====================================
INSERT INTO users (
    name, staff_id, username, password, role, permissions, must_change_password
) VALUES (
    'System Administrator',
    'ADMIN001',
    'MIS001',
    '$2b$10$VBGKICOAtwnPnNSM55e2S.5I3Q73V.TsEukiwJqsk.sWzutSjpvMq',
    'admin',
    ARRAY['all'],
    TRUE
);

-- ====================================
-- FINAL VERIFICATION
-- ====================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'daily_reports'
ORDER BY ordinal_position;
