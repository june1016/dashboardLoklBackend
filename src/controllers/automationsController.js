const { generateOverdueReport } = require('../cron/reports');
const { sendOverdueEmails } = require('../cron/emails');
const { updateUsersInMora } = require('../cron/usersInMora');

/**
 * Genera un reporte de mora bajo demanda
 */
exports.generateReport = async (req, res) => {
  try {
    const { prisma } = req;
    const { format } = req.query;
    
    // Por ahora solo generamos Excel
    if (format && format !== 'excel') {
      return res.status(400).json({ error: 'Formato no soportado. Use excel.' });
    }
    
    const filePath = await generateOverdueReport(prisma);
    
    res.json({
      success: true,
      message: 'Reporte generado exitosamente',
      filePath
    });
  } catch (error) {
    console.error('Error generando reporte:', error);
    res.status(500).json({ error: 'Error generando reporte' });
  }
};

/**
 * Envía emails de cobranza bajo demanda
 */
exports.sendEmails = async (req, res) => {
  try {
    const { prisma } = req;
    
    const emailsSent = await sendOverdueEmails(prisma);
    
    res.json({
      success: true,
      message: `${emailsSent} emails enviados exitosamente`
    });
  } catch (error) {
    console.error('Error enviando emails:', error);
    res.status(500).json({ error: 'Error enviando emails' });
  }
};

/**
 * Actualiza la tabla de usuarios en mora manualmente
 */
exports.updateOverdueTable = async (req, res) => {
  try {
    const { prisma } = req;
    
    const usersCount = await updateUsersInMora(prisma);
    
    res.json({
      success: true,
      message: `Tabla actualizada con ${usersCount} usuarios en mora`
    });
  } catch (error) {
    console.error('Error actualizando tabla:', error);
    res.status(500).json({ error: 'Error actualizando tabla' });
  }
};