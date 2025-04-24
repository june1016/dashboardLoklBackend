const nodemailer = require('nodemailer');

/**
 * Envía emails de cobranza a usuarios en mora
 */
async function sendOverdueEmails(prisma) {
  // Configurar transporte de correo
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  
  // Obtener usuarios en mora
  const usersInMora = await getUsersInMora(prisma);
  let emailsSent = 0;
  
  // Enviar email a cada usuario
  for (const user of usersInMora) {
    try {
      const mailOptions = {
        from: `"LOKL Inversiones" <${process.env.SMTP_USER}>`,
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
      
      await transporter.sendMail(mailOptions);
      emailsSent++;
    } catch (error) {
      console.error(`Error enviando email a ${user.email}:`, error);
    }
  }
  
  console.log(`Emails enviados: ${emailsSent} de ${usersInMora.length}`);
  return emailsSent;
}

module.exports = { sendOverdueEmails };