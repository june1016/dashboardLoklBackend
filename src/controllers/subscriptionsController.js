/**
 * Obtiene suscripciones activas y próximas a finalizar
 */
exports.getActiveSubscriptions = async (req, res) => {
    try {
      const { prisma } = req;
      
      // Obtener todas las inversiones tipo suscripción (no declinadas)
      const subscriptions = await prisma.investment.findMany({
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
      
      // Procesar datos para el formato requerido
      const processedSubscriptions = subscriptions.map(subscription => {
        // Calcular cuotas totales y pagadas
        const totalInstallments = subscription.installments.length;
        const paidInstallments = subscription.installments.filter(
          inst => inst.transactions.some(t => t.status === 'APPROVED')
        ).length;
        const remainingInstallments = totalInstallments - paidInstallments;
        
        // Determinar si está finalizando pronto (3 o menos cuotas restantes)
        const isEndingSoon = remainingInstallments <= 3 && remainingInstallments > 0;
        
        return {
          id: subscription.id,
          status: isEndingSoon ? 'ending_soon' : 'active',
          project: subscription.project.name,
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
      const { prisma } = req;
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
        whereCondition.project = {
          name: {
            contains: project,
            mode: 'insensitive'
          }
        };
      }
      
      // Obtener suscripciones con todos los datos necesarios
      const subscriptions = await prisma.investment.findMany({
        where: whereCondition,
        include: {
          project: true,
          installments: {
            orderBy: { installmentNumber: 'asc' },
            include: {
              transactions: {
                where: { status: 'APPROVED' }
              }
            }
          }
        }
      });
      
      // Función para verificar mora
      const isInstallmentOverdue = (installment) => {
        if (installment.transactions.length > 0) return false;
        
        const dueDate = new Date(installment.paymentDate);
        const graceDate = new Date(dueDate);
        graceDate.setMonth(dueDate.getMonth() + 1);
        graceDate.setDate(5);
        
        return new Date() > graceDate;
      };
      
      // Procesar datos para el formato requerido
      let processedSubscriptions = subscriptions.map(subscription => {
        // Calcular total de cuotas y restantes
        const totalInstallments = subscription.installments.length;
        const paidInstallments = subscription.installments.filter(
          inst => inst.transactions.length > 0
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
        subscription.installments.forEach(installment => {
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
        const totalPaid = subscription.installments.reduce(
          (sum, inst) => sum + inst.transactions.reduce(
            (tSum, t) => tSum + (t.value - t.paymentMethodFee),
            0
          ),
          0
        );
        
        const totalValue = subscription.installments.reduce(
          (sum, inst) => sum + inst.totalValue, 
          0
        );
        
        const totalRemaining = totalValue - totalPaid;
        
        // Procesar cuotas para la tabla
        const installmentDetails = subscription.installments.map(inst => {
          const isPaid = inst.transactions.length > 0;
          const isOverdue = isInstallmentOverdue(inst);
          
          let status = 'pending';
          if (isPaid) status = 'paid';
          else if (isOverdue) status = 'overdue';
          
          return {
            id: inst.installmentNumber,
            dueDate: inst.paymentDate,
            amount: inst.totalValue,
            status,
            paymentDate: isPaid ? inst.transactions[0].createdAt : null
          };
        });
        
        return {
          id: subscription.id,
          status: subscriptionStatus,
          project: subscription.project.name,
          investment: subscription.investmentValue,
          units: subscription.unitsQuantity,
          startDate: subscription.createdAt,
          endDate: subscription.installments.length > 0 
            ? subscription.installments[subscription.installments.length - 1].paymentDate 
            : null,
          totalInstallments,
          overdue: overdueAmount,
          totalPaid,
          totalRemaining,
          email: subscription.email,
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