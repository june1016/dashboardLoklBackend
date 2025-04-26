const express = require('express');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('../generated/prisma');
const { initCronJobs } = require('./cron');

// Importar rutas
const subscriptionsRoutes = require('./routes/subscriptions');
const analyticsRoutes = require('./routes/analytics');
const automationsRoutes = require('./routes/automations');
const insightsRoutes = require('./routes/insights');
const dashboardRoutes = require('./routes/dashboard');

// Inicializar Express y Prisma
const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la carpeta 'reports'
app.use('/reports', express.static(path.join(__dirname, '../reports')));

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
app.use('/api/dashboard', dashboardRoutes);

// Inicializar tareas programadas
initCronJobs(prisma);

// Manejador de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Error en el servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
  });
});

module.exports = { app, prisma };