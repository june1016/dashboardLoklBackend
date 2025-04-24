/**
 * Actualiza la tabla de usuarios en mora
 */
async function updateUsersInMora(prisma) {
    try {
      // Iniciamos transacción para asegurar consistencia
      const result = await prisma.$transaction(async (tx) => {
        // Limpiar tabla existente
        await tx.userInMora.deleteMany({});
        
        // Obtener todas las inversiones tipo suscripción
        const investments = await tx.investment.findMany({
          where: {
            type: 'subscription',
            status: { not: 'declined' }
          },
          include: {
            project: true,
            installments: {
              include: {
                transactions: {
                  where: { status: 'APPROVED' }
                }
              }
            }
          }
        });
        
        // Identificar usuarios en mora
        const usersInMora = [];
        
        for (const investment of investments) {
          if (!investment.email) continue;
          
          let totalMoraAmount = 0;
          let earliestMoraDate = null;
          
          for (const installment of investment.installments) {
            // Verificar si está en mora
            if (isInstallmentOverdue(installment)) {
              totalMoraAmount += installment.totalValue;
              
              const dueDate = new Date(installment.paymentDate);
              if (!earliestMoraDate || dueDate < earliestMoraDate) {
                earliestMoraDate = dueDate;
              }
            }
          }
          
          // Si hay mora, agregar a la lista
          if (totalMoraAmount > 0 && earliestMoraDate) {
            usersInMora.push({
              email: investment.email,
              moraAmount: totalMoraAmount,
              moraStartDate: earliestMoraDate,
              investmentId: investment.id,
              projectId: investment.projectId,
              projectName: investment.project.name
            });
          }
        }
        
        // Crear registros en la tabla
        for (const user of usersInMora) {
          await tx.userInMora.create({
            data: {
              email: user.email,
              moraAmount: user.moraAmount,
              moraStartDate: user.moraStartDate,
              investmentId: user.investmentId,
              projectId: user.projectId
            }
          });
        }
        
        return usersInMora.length;
      });
      
      console.log(`Tabla actualizada: ${result} usuarios en mora.`);
      return result;
    } catch (error) {
      console.error('Error actualizando tabla de mora:', error);
      throw error;
    }
  }
  
  function isInstallmentOverdue(installment) {
    // Si tiene transacción, no está en mora
    if (installment.transactions.length > 0) return false;
    
    const dueDate = new Date(installment.paymentDate);
    const graceDate = new Date(dueDate);
    graceDate.setMonth(dueDate.getMonth() + 1);
    graceDate.setDate(5);
    
    return new Date() > graceDate;
  }
  
  module.exports = { updateUsersInMora };