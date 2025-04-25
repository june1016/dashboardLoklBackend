/**
 * Obtiene suscripciones activas y próximas a finalizar
 */
exports.getActiveSubscriptions = async (req, res) => {
  try {
    const prisma = req.prisma; // Asegúrate de que prisma esté disponible
    
    if (!prisma) {
      console.error('Prisma no está disponible en la solicitud');
      return res.status(500).json({ error: 'Error de configuración del servidor' });
    }
    
    // Obtener todas las inversiones tipo suscripción (no declinadas)
    const subscriptions = await prisma.Investments.findMany({ // Nota: "Investments" con I mayúscula según tu schema
      where: {
        type: 'subscription',
        status: { not: 'declined' }
      },
      include: {
        Projects: true, // Nota: "Projects" en lugar de "project" según tu schema
        Installments: {  // Nota: "Installments" en lugar de "installments" según tu schema
          include: {
            Transactions: { // Nota: "Transactions" en lugar de "transactions" según tu schema
              where: { status: 'APPROVED' }
            }
          }
        }
      }
    });
    
    // Procesar datos para el formato requerido
    const processedSubscriptions = subscriptions.map(subscription => {
      // Calcular cuotas totales y pagadas
      const totalInstallments = subscription.Installments.length;
      const paidInstallments = subscription.Installments.filter(
        inst => inst.Transactions.some(t => t.status === 'APPROVED')
      ).length;
      const remainingInstallments = totalInstallments - paidInstallments;
      
      // Determinar si está finalizando pronto (3 o menos cuotas restantes)
      const isEndingSoon = remainingInstallments <= 3 && remainingInstallments > 0;
      
      return {
        id: subscription.id,
        status: isEndingSoon ? 'ending_soon' : 'active',
        project: subscription.Projects.name,
        investment: subscription.investmentValue,
        units: subscription.unitsQuantity,
        remainingInstallments,
        totalInstallments
      };
    });
    
    // Dividir en activas y finalizando pronto
    const active = processedSubscriptions.filter(s => s.status === 'active');
    const endingSoon = processedSubscriptions.filter(s => s.status === 'ending_soon');
    
    res.json({
      active,
      endingSoon,
      total: processedSubscriptions.length
    });
  } catch (error) {
    console.error('Error obteniendo suscripciones:', error);
    res.status(500).json({ error: 'Error obteniendo suscripciones' });
  }
};

/**
 * Obtiene tabla de suscripciones con filtros
 */
exports.getAllSubscriptions = async (req, res) => {
  try {
    const prisma = req.prisma;
    
    // Verificar que prisma esté disponible
    if (!prisma) {
      console.error('Prisma no está disponible en la solicitud');
      return res.status(500).json({ error: 'Error de configuración del servidor' });
    }
    
    const { email, status, project, overdueMin, overdueMax } = req.query;
    
    // Construir consulta base
    let whereCondition = {
      type: 'subscription',
      status: { not: 'declined' }
    };
    
    // Aplicar filtros
    if (email) {
      whereCondition.email = {
        contains: email,
        mode: 'insensitive'
      };
    }
    
    if (project) {
      whereCondition.Projects = {
        name: {
          contains: project,
          mode: 'insensitive'
        }
      };
    }
    
    // Obtener suscripciones con todos los datos necesarios
    const subscriptions = await prisma.Investments.findMany({
      where: whereCondition,
      include: {
        Projects: true,
        Installments: {
          orderBy: { installmentNumber: 'asc' },
          include: {
            Transactions: {
              where: { status: 'APPROVED' }
            }
          }
        }
      }
    });
    
    // Función para verificar mora
    const isInstallmentOverdue = (installment) => {
      if (installment.Transactions.length > 0) return false;
      
      const dueDate = new Date(installment.paymentDate);
      const graceDate = new Date(dueDate);
      graceDate.setMonth(dueDate.getMonth() + 1);
      graceDate.setDate(5);
      
      return new Date() > graceDate;
    };
    
    // Procesar datos para el formato requerido
    let processedSubscriptions = subscriptions.map(subscription => {
      // Calcular total de cuotas y restantes
      const totalInstallments = subscription.Installments.length;
      const paidInstallments = subscription.Installments.filter(
        inst => inst.Transactions.length > 0
      ).length;
      const remainingInstallments = totalInstallments - paidInstallments;
      
      // Determinar estado
      let subscriptionStatus = 'active';
      if (remainingInstallments <= 0) {
        subscriptionStatus = 'completed';
      } else if (remainingInstallments <= 3) {
        subscriptionStatus = 'ending_soon';
      }
      
      // Si hay filtro de estado, verificar
      if (status && status !== subscriptionStatus) {
        return null; // Filtrar esta suscripción
      }
      
      // Calcular mora
      let overdueAmount = 0;
      subscription.Installments.forEach(installment => {
        if (isInstallmentOverdue(installment)) {
          overdueAmount += installment.totalValue;
        }
      });
      
      // Filtrar por rango de mora
      if (
        (overdueMin && overdueAmount < parseFloat(overdueMin)) || 
        (overdueMax && overdueAmount > parseFloat(overdueMax))
      ) {
        return null;
      }
      
      // Calcular totales pagado y por pagar
      const totalPaid = subscription.Installments.reduce(
        (sum, inst) => sum + inst.Transactions.reduce(
          (tSum, t) => tSum + (t.value - (t.paymentMethodFee || 0)),
          0
        ),
        0
      );
      
      const totalValue = subscription.Installments.reduce(
        (sum, inst) => sum + (inst.totalValue || 0), 
        0
      );
      
      const totalRemaining = totalValue - totalPaid;
      
      // Procesar cuotas para la tabla
      const installmentDetails = subscription.Installments.map(inst => {
        const isPaid = inst.Transactions.length > 0;
        const isOverdue = isInstallmentOverdue(inst);
        
        let status = 'pending';
        if (isPaid) status = 'paid';
        else if (isOverdue) status = 'overdue';
        
        return {
          id: inst.installmentNumber || 0,
          dueDate: inst.paymentDate,
          amount: inst.totalValue || 0,
          status,
          paymentDate: isPaid ? inst.Transactions[0].createdAt : null
        };
      });
      
      return {
        id: subscription.id,
        status: subscriptionStatus,
        project: subscription.Projects.name || 'Sin nombre',
        investment: subscription.investmentValue || 0,
        units: subscription.unitsQuantity || 0,
        startDate: subscription.createdAt,
        endDate: subscription.Installments.length > 0 
          ? subscription.Installments[subscription.Installments.length - 1].paymentDate 
          : subscription.createdAt,
        totalInstallments,
        overdue: overdueAmount,
        totalPaid,
        totalRemaining,
        email: subscription.email || 'Sin email',
        installments: installmentDetails
      };
    });
    
    // Filtrar elementos nulos (los que no cumplen con los filtros)
    processedSubscriptions = processedSubscriptions.filter(Boolean);
    
    res.json(processedSubscriptions);
  } catch (error) {
    console.error('Error obteniendo suscripciones:', error);
    res.status(500).json({ error: 'Error obteniendo suscripciones' });
  }
};