const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

//login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Find user by username (case-insensitive)
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Compare password
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        permissions: user.permissions 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [user.id, 'LOGIN', `User ${user.username} logged in`]
    );

    // Return user data (excluding password) and token
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword,
      mustChangePassword: user.must_change_password
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    // Password strength validation
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Get current user
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and set must_change_password to false
    await pool.query(
      `UPDATE users 
       SET password = $1, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [hashedPassword, userId]
    );

    // Log activity
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [userId, 'PASSWORD_CHANGE', 'User changed their password']
    );

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Server error changing password' });
  }
};

const register = async (req, res) => {
  try {
    const { name, staffId, username, password, role, permissions } = req.body;

    // Validate input
    if (!name || !staffId || !username || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // ===== NEW: Check permissions based on requester's role =====
    // Supervisors can only create staff accounts
    if (req.user.role === 'supervisor' && role !== 'staff') {
      return res.status(403).json({ 
        message: 'Supervisors can only create staff accounts' 
      });
    }

    // Only admins can create supervisors
    if (role === 'supervisor' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Only admins can create supervisor accounts' 
      });
    }

    // Only admins can create other admins
    if (role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Only admins can create admin accounts' 
      });
    }
    // ===== END NEW =====

    // Check if username or staffId already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR staff_id = $2',
      [username, staffId]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'Username or Staff ID already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ===== NEW: Set default permissions for supervisors =====
    let userPermissions = permissions || [];
    if (role === 'supervisor') {
      userPermissions = ['all'];
    }
    // ===== END NEW =====

    // Insert new user with must_change_password = TRUE
    const result = await pool.query(
      `INSERT INTO users (name, staff_id, username, password, role, permissions, must_change_password) 
       VALUES ($1, $2, $3, $4, $5, $6, TRUE) 
       RETURNING id, name, staff_id, username, role, permissions, must_change_password, created_at`,
      [name, staffId, username, hashedPassword, role, userPermissions]
    );

    const newUser = result.rows[0];

    // ===== NEW: Log activity =====
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [req.user.id, 'USER_CREATED', `Created new ${role}: ${name}`]
    );
    // ===== END NEW =====

    res.status(201).json({
      message: 'User created successfully. They must change password on first login.',
      user: newUser
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

module.exports = { login, register, changePassword };