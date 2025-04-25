const nodemailer = require('nodemailer');

// Configuración de frecuencia por defecto
let emailFrequency = 'weekly'; // 'manual', 'daily', 'weekly'

/**
 * Configura la frecuencia de envío de emails
 */
async function setEmailSchedule(prisma, frequency) {
  emailFrequency = frequency;
  // Aquí podrías guardar la configuración en la base de datos
  // para persistirla entre reinicios del servidor
  return frequency;
}

/**
 * Obtiene la configuración actual de frecuencia
 */
function getEmailFrequency() {
  return emailFrequency;
}

/**
 * Envía emails de cobranza a usuarios en mora
 */
async function sendOverdueEmails(prisma) {
  // Configuración del transporte de correo (SMTP)
  const testAccount = await nodemailer.createTestAccount();
  
  // Registra la información de la cuenta para acceso directo
  console.log('\n========== INFO DE ACCESO ETHEREAL ==========');
  console.log(`URL de acceso: ${testAccount.web}`);
  console.log(`Usuario: ${testAccount.user}`);
  console.log(`Contraseña: ${testAccount.pass}`);
  console.log('=============================================\n');
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || testAccount.user,
      pass: process.env.SMTP_PASS || testAccount.pass
    }
  });
  
  // Obtener usuarios en mora
  const usersInMora = await getUsersInMora(prisma);
  let emailsSent = 0;
  const previewUrls = [];
  
  console.log(`Iniciando envío de correos a ${usersInMora.length} usuarios en mora...`);
  
  // Enviar email a cada usuario
  for (const user of usersInMora) {
    try {
      const mailOptions = {
        from: `"LOKL Inversiones" <${process.env.SMTP_USER || testAccount.user}>`,
        to: user.email,
        subject: 'Recordatorio de Pago Pendiente - LOKL',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2 style="color: #221FEB;">Recordatorio de Pago Pendiente</h2>
            <p>Estimado/a inversionista:</p>
            <p>Le informamos que registramos un pago pendiente en su inversión 
               en el proyecto <strong>${user.projectName}</strong>.</p>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <p><strong>Monto pendiente:</strong> $${user.moraAmount.toLocaleString('es-CO')}</p>
              <p><strong>Fecha de inicio de mora:</strong> ${formatDate(user.moraStartDate)}</p>
              <p><strong>Días en mora:</strong> ${calculateDaysSince(user.moraStartDate)}</p>
            </div>
            
            <p>Por favor realice el pago lo antes posible para mantener al día su inversión.</p>
            <p>Saludos cordiales,<br>Equipo LOKL</p>
          </div>
        `
      };
      
      const info = await transporter.sendMail(mailOptions);
      emailsSent++;
      
      // Guardar URL de vista previa
      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        // Obtener URL de vista previa de forma más confiable
        let previewUrl;
        try {
          // Intentar con el método estándar primero
          previewUrl = nodemailer.getTestMessageUrl(info);
          
          // Si la URL es undefined o vacía, construirla manualmente
          if (!previewUrl) {
            const messageId = info.messageId;
            // Limpiar los caracteres < y > si existen
            const cleanMessageId = messageId.startsWith('<') ? 
              messageId.substring(1, messageId.length - 1) : messageId;
            previewUrl = `https://ethereal.email/message/${cleanMessageId}`;
          }
        } catch (err) {
          // Si hay error al obtener la URL, construir una genérica
          previewUrl = `https://ethereal.email/`;
          console.log(`⚠️ No se pudo generar URL específica para el correo: ${err.message}`);
        }
        
        // Agregar información de la cuenta para acceso directo
        previewUrls.push({
          email: user.email,
          url: previewUrl,
          account: {
            user: testAccount.user,
            pass: testAccount.pass,
            web: testAccount.web // La URL de acceso web a la cuenta
          }
        });
        
        console.log(`✅ Email enviado a ${user.email} - URL de vista previa: ${previewUrl}`);
      } else {
        console.log(`✅ Email enviado a ${user.email}`);
      }
      
      // Imprimir progreso cada 5 emails
      if (emailsSent % 5 === 0) {
        console.log(`Progreso: ${emailsSent}/${usersInMora.length} emails enviados`);
      }
    } catch (error) {
      console.error(`❌ Error enviando email a ${user.email}:`, error);
    }
  }
  
  console.log(`Finalizado: ${emailsSent} de ${usersInMora.length} emails enviados correctamente`);
  console.log(`Para ver todos los correos enviados, accede a: ${testAccount.web}`);
  console.log(`Usuario: ${testAccount.user}`);
  console.log(`Contraseña: ${testAccount.pass}`);
  
  // Devolver tanto el conteo como las URLs
  return {
    emailsSent,
    previewUrls
  };
}

// Reutilizamos la función de getUsersInMora del módulo reports
async function getUsersInMora(prisma) {
  // Obtener usuarios desde la tabla UsersInMora
  const usersFromDb = await prisma.usersInMora.findMany({
    include: {
      Investments: true,
      Projects: true
    }
  });
  
  if (usersFromDb.length > 0) {
    return usersFromDb.map(user => ({
      email: user.email,
      projectName: user.Projects.name || 'Desconocido',
      moraAmount: user.moraAmount,
      moraStartDate: user.moraStartDate,
      investmentValue: user.Investments.investmentValue
    }));
  }
  
  // Si no hay datos, retornamos un array vacío (idealmente nunca llegamos aquí)
  return [];
}

function formatDate(date) {
  return date.toLocaleDateString('es-CO');
}

function calculateDaysSince(date) {
  const now = new Date();
  const diffMs = now - date;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

module.exports = { 
  sendOverdueEmails,
  setEmailSchedule,
  getEmailFrequency
};