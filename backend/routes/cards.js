const express = require('express');
const router = express.Router();
const {
  getAllCards,
  createCard,
  updateCardStatus,
  deleteCard
} = require('../controllers/cardsController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

router.get('/', getAllCards);
router.post('/', createCard);
router.put('/:id/status', updateCardStatus);
router.delete('/:id', deleteCard);

module.exports = router;