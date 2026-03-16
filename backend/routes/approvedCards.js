const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  getApprovedCards,
  getApprovedCardById,
  getApprovedCardsStats
} = require('../controllers/approvedCardsController');

router.use(authenticateToken);

router.get('/', getApprovedCards);
router.get('/stats', getApprovedCardsStats);
router.get('/:id', getApprovedCardById);

module.exports = router;
