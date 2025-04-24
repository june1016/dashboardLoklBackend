const express = require('express');
const router = express.Router();
const automationsController = require('../controllers/automationsController');

router.get('/generate-report', automationsController.generateReport);
router.post('/send-emails', automationsController.sendEmails);
router.post('/update-overdue-table', automationsController.updateOverdueTable);

module.exports = router;