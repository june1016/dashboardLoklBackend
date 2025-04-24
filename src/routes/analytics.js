const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

router.get('/expected-vs-actual', analyticsController.getExpectedVsActual);
router.get('/monthly-overdue', analyticsController.getMonthlyOverdue);
router.get('/overdue-by-project', analyticsController.getOverdueByProject);

module.exports = router;