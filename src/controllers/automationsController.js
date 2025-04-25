const { generateOverdueReport } = require('../cron/reports');
const { sendOverdueEmails, setEmailSchedule } = require('../cron/emails');
const { updateUsersInMora } = require('../cron/usersInMora');
const { PrismaClient } = require('../../generated/prisma');
const prisma = new PrismaClient();

// Modelo para almacenar historial de ejecuciones
const saveExecutionRecord = async (type, status, message) => {
  try {
    // Crear registro en la base de datos
    const record = await prisma.automationExecution.create({
      data: {
        type,
        status,
        message,
        timestamp: new Date()
      }
    });
    return record;
  } catch (error) {
    console.error('Error guardando registro de ejecución:', error);
    // Si falla, continuamos sin guardar el registro
    return null;
  }
};

/**
 * Genera un reporte de mora bajo demanda
 */
exports.generateReport = async (req, res) => {
  try {
    const { format = 'excel' } = req.query;
    
    // Por ahora solo generamos Excel
    if (format && format !== 'excel' && format !== 'pdf') {
      return res.status(400).json({ 
        success: false,
        message: 'Formato no soportado. Use excel o pdf.'
      });
    }
    
    const filePath = await generateOverdueReport(prisma, format);
    
    // Guardar registro de ejecución
    await saveExecutionRecord('report', 'success', `Reporte generado en ${format}`);
    
    res.json({
      success: true,
      message: 'Reporte generado exitosamente',
      data: { filePath }
    });
  } catch (error) {
    console.error('Error generando reporte:', error);
    
    // Guardar registro de error
    await saveExecutionRecord('report', 'error', error.message || 'Error generando reporte');
    
    res.status(500).json({ 
      success: false,
      message: 'Error generando reporte',
      error: error.message
    });
  }
};

/**
 * Envía emails de cobranza bajo demanda
 */
exports.sendEmails = async (req, res) => {
  try {
    // Enviamos los correos y obtenemos resultado
    const result = await sendOverdueEmails(prisma);
    
    let emailsSent, previewUrls;
    
    // Verificamos si el resultado tiene el nuevo formato o el viejo
    if (typeof result === 'object' && result.emailsSent !== undefined) {
      emailsSent = result.emailsSent;
      previewUrls = result.previewUrls || [];
    } else {
      // Compatibilidad con formato anterior
      emailsSent = result;
      previewUrls = [];
    }
    
    // Guardar registro de ejecución
    await saveExecutionRecord(
      'email', 
      'success', 
      `${emailsSent} emails enviados exitosamente`
    );
    
    res.json({
      success: true,
      message: `${emailsSent} emails enviados exitosamente`,
      data: { 
        emailsSent,
        previewUrls: previewUrls.slice(0, 10) // Limitamos a 10 para no hacer la respuesta muy larga
      }
    });
  } catch (error) {
    console.error('Error enviando emails:', error);
    
    // Guardar registro de error
    await saveExecutionRecord('email', 'error', error.message || 'Error enviando emails');
    
    res.status(500).json({ 
      success: false,
      message: 'Error enviando emails',
      error: error.message
    });
  }
};

/**
 * Actualiza la tabla de usuarios en mora manualmente
 */
exports.updateOverdueTable = async (req, res) => {
  try {
    const usersCount = await updateUsersInMora(prisma);
    
    // Guardar registro de ejecución
    await saveExecutionRecord(
      'table', 
      'success', 
      `Tabla actualizada con ${usersCount} usuarios en mora`
    );
    
    res.json({
      success: true,
      message: `Tabla actualizada con ${usersCount} usuarios en mora`,
      data: { usersCount }
    });
  } catch (error) {
    console.error('Error actualizando tabla:', error);
    
    // Guardar registro de error
    await saveExecutionRecord('table', 'error', error.message || 'Error actualizando tabla');
    
    res.status(500).json({ 
      success: false,
      message: 'Error actualizando tabla',
      error: error.message
    });
  }
};

/**
 * Obtiene el historial de ejecuciones de automatizaciones
 */
exports.getExecutionHistory = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Obtener los últimos registros
    const history = await prisma.automationExecution.findMany({
      take: parseInt(limit),
      orderBy: {
        timestamp: 'desc'
      }
    });
    
    // Formatear fechas para el frontend
    const formattedHistory = history.map(record => ({
      id: record.id,
      type: record.type,
      status: record.status,
      message: record.message,
      timestamp: record.timestamp.toLocaleString('es-CO', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }));
    
    res.json({
      success: true,
      data: formattedHistory
    });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error obteniendo historial',
      error: error.message
    });
  }
};

/**
 * Configura la frecuencia de envío de emails
 */
exports.setEmailFrequency = async (req, res) => {
  try {
    const { frequency } = req.body;
    
    // Validar la frecuencia
    if (!['manual', 'daily', 'weekly'].includes(frequency)) {
      return res.status(400).json({ 
        success: false,
        message: 'Frecuencia no válida. Use manual, daily o weekly.'
      });
    }
    
    // Actualizar configuración
    await setEmailSchedule(prisma, frequency);
    
    res.json({
      success: true,
      message: `Frecuencia configurada a: ${frequency}`
    });
  } catch (error) {
    console.error('Error configurando frecuencia:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error configurando frecuencia',
      error: error.message
    });
  }
};