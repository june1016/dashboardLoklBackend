const express = require('express');
const router = express.Router();
const insightsController = require('../controllers/insightsController');

router.get('/payment-patterns', insightsController.getPaymentPatterns);

module.exports = router;