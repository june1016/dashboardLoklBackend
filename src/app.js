const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

// Importar rutas
const subscriptionsRoutes = require('./routes/subscriptions');
const analyticsRoutes = require('./routes/analytics');
const automationsRoutes = require('./routes/automations');
const insightsRoutes = require('./routes/insights');

// Inicializar Express y Prisma
const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Hacer Prisma disponible en las rutas
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Definir rutas
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/automations', automationsRoutes);
app.use('/api/insights', insightsRoutes);

// Manejador de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Error en el servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

module.exports = app;