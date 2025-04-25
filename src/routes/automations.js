const express = require('express');
const router = express.Router();
const automationsController = require('../controllers/automationsController');

// Rutas para ejecución manual de automatizaciones
router.get('/generate-report', automationsController.generateReport);
router.post('/send-emails', automationsController.sendEmails);
router.post('/update-overdue-table', automationsController.updateOverdueTable);

// Nueva ruta para obtener historial de ejecuciones
router.get('/execution-history', automationsController.getExecutionHistory);

// Opcional: Ruta para configurar frecuencia de emails
router.post('/set-email-frequency', automationsController.setEmailFrequency);

module.exports = router;