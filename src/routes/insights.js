const express = require('express');
const router = express.Router();
const insightsController = require('../controllers/insightsController');


// Añadir la ruta para la segmentación de clientes
router.get('/customer-segmentation', insightsController.getCustomerSegmentation);

module.exports = router;