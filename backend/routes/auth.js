const express = require('express');
const router = express.Router();
const { login, register, changePassword } = require('../controllers/authController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { ensureAuthSchema } = require('../services/authSchema');

router.use(async (req, res, next) => {
  try {
    await ensureAuthSchema();
    next();
  } catch (error) {
    console.error('Error ensuring auth schema:', error);
    res.status(503).json({ message: 'Authentication service unavailable' });
  }
});

// Public routes
router.post('/login', login);
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Protected routes
router.post('/change-password', authenticateToken, changePassword);
router.post('/register', authenticateToken, authorizeRole(['admin', 'supervisor']), register);


module.exports = router;