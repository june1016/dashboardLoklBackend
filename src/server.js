require('dotenv').config();
const { app, prisma } = require('./app'); // Desestructura el objeto importado
const { initCronJobs } = require('./cron');

const PORT = process.env.PORT || 3001;

// Inicializar tareas programadas
initCronJobs(prisma);

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
});

// Manejar cierre del servidor
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  console.log('Conexión con la base de datos cerrada');
  process.exit(0);
});