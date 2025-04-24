const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

/**
 * Genera un reporte de mora en Excel
 */
async function generateOverdueReport(prisma) {
  // Crear directorio para reportes si no existe
  const reportsDir = path.join(__dirname, '../../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Crear libro de Excel
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Reporte de Mora');
  
  // Configurar encabezados
  sheet.columns = [
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Proyecto', key: 'project', width: 20 },
    { header: 'Monto en Mora', key: 'amount', width: 15 },
    { header: 'Fecha de Inicio', key: 'startDate', width: 15 },
    { header: 'Días en Mora', key: 'days', width: 12 },
    { header: 'Valor Inversión', key: 'investment', width: 15 }
  ];
  
  // Obtener usuarios en mora
  const usersInMora = await getUsersInMora(prisma);
  
  // Agregar filas
  for (const user of usersInMora) {
    sheet.addRow({
      email: user.email,
      project: user.projectName,
      amount: user.moraAmount,
      startDate: formatDate(user.moraStartDate),
      days: calculateDaysSince(user.moraStartDate),
      investment: user.investmentValue
    });
  }
  
  // Dar formato
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn('amount').numFmt = '"$"#,##0.00';
  sheet.getColumn('investment').numFmt = '"$"#,##0.00';
  
  // Guardar archivo
  const date = new Date().toISOString().split('T')[0];
  const filePath = path.join(reportsDir, `reporte_mora_${date}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  
  console.log(`Reporte generado: ${filePath}`);
  return filePath;
}

/**
 * Obtiene la lista de usuarios en mora con detalles
 */
async function getUsersInMora(prisma) {
  // Implementar la lógica para obtener usuarios en mora
  // Similar a la que usamos en el controlador de mora por proyecto
  // ...
}

function formatDate(date) {
  return date.toLocaleDateString('es-CO');
}

function calculateDaysSince(date) {
  const now = new Date();
  const diffMs = now - date;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

module.exports = { generateOverdueReport };