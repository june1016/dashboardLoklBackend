const cron = require('node-cron');
const { generateOverdueReport } = require('./reports');
const { sendOverdueEmails } = require('./emails');
const { updateUsersInMora } = require('./usersInMora');

function initCronJobs(prisma) {
  // Generar reporte diariamente a las 6am
  cron.schedule('0 6 * * *', async () => {
    try {
      console.log('Generando reporte de mora automático');
      await generateOverdueReport(prisma);
    } catch (error) {
      console.error('Error en generación automática de reporte:', error);
    }
  });
  
  // Enviar emails de cobranza semanalmente (lunes 8am)
  cron.schedule('0 8 * * 1', async () => {
    try {
      console.log('Enviando emails de cobranza automáticos');
      await sendOverdueEmails(prisma);
    } catch (error) {
      console.error('Error en envío automático de emails:', error);
    }
  });
  
  // Actualizar tabla de usuarios en mora (diario 1am)
  cron.schedule('0 1 * * *', async () => {
    try {
      console.log('Actualizando tabla de usuarios en mora');
      await updateUsersInMora(prisma);
    } catch (error) {
      console.error('Error en actualización de tabla de mora:', error);
    }
  });
  
  console.log('Tareas programadas inicializadas');
}

module.exports = { initCronJobs };