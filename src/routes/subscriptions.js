const express = require('express');
const router = express.Router();
const subscriptionsController = require('../controllers/subscriptionsController');

router.get('/active', subscriptionsController.getActiveSubscriptions);
router.get('/', subscriptionsController.getAllSubscriptions);

module.exports = router;