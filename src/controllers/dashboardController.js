// En un nuevo archivo dashboardController.js
exports.getDashboardStats = async (req, res) => {
    try {
      const prisma = req.prisma;
      
      if (!prisma) {
        console.error('Prisma no está disponible en la solicitud');
        return res.status(500).json({ error: 'Error de configuración del servidor' });
      }
      
      // Obtener fecha actual y fechas para comparaciones mensuales
      const now = new Date();
      const currentMonth = now.getMonth();
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const currentYear = now.getFullYear();
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      
      const firstDayCurrentMonth = new Date(currentYear, currentMonth, 1);
      const lastDayCurrentMonth = new Date(currentYear, currentMonth + 1, 0);
      const firstDayLastMonth = new Date(lastMonthYear, lastMonth, 1);
      const lastDayLastMonth = new Date(lastMonthYear, lastMonth + 1, 0);
      
      // 1. Ingresos Totales
      const totalTransactions = await prisma.Transactions.findMany({
        where: {
          status: 'APPROVED'
        }
      });
      
      const totalIncome = totalTransactions.reduce(
        (sum, t) => sum + (t.value - (t.paymentMethodFee || 0)), 
        0
      );
      
      // 2. Ingresos del mes actual
      const currentMonthTransactions = await prisma.Transactions.findMany({
        where: {
          status: 'APPROVED',
          createdAt: {
            gte: firstDayCurrentMonth,
            lte: lastDayCurrentMonth
          }
        }
      });
      
      const thisMonthIncome = currentMonthTransactions.reduce(
        (sum, t) => sum + (t.value - (t.paymentMethodFee || 0)), 
        0
      );
      
      // 3. Ingresos del mes anterior
      const lastMonthTransactions = await prisma.Transactions.findMany({
        where: {
          status: 'APPROVED',
          createdAt: {
            gte: firstDayLastMonth,
            lte: lastDayLastMonth
          }
        }
      });
      
      const lastMonthIncome = lastMonthTransactions.reduce(
        (sum, t) => sum + (t.value - (t.paymentMethodFee || 0)), 
        0
      );
      
      // 4. Suscripciones activas y nuevas
      const activeSubscriptions = await prisma.Investments.count({
        where: {
          type: 'subscription',
          status: { not: 'declined' }
        }
      });
      
      const newSubscriptions = await prisma.Investments.count({
        where: {
          type: 'subscription',
          status: { not: 'declined' },
          createdAt: {
            gte: firstDayCurrentMonth,
            lte: lastDayCurrentMonth
          }
        }
      });
      
      // 5. Tasa de morosidad
      // Obtener todas las cuotas
      const allInstallments = await prisma.Installments.findMany({
        where: {
          Investments: {
            type: 'subscription',
            status: { not: 'declined' }
          }
        },
        include: {
          Transactions: {
            where: { status: 'APPROVED' }
          }
        }
      });
      
      // Función para verificar si una cuota está en mora
      const isInstallmentOverdue = (installment) => {
        if (installment.Transactions.length > 0) return false;
        
        const dueDate = new Date(installment.paymentDate);
        const graceDate = new Date(dueDate);
        graceDate.setMonth(dueDate.getMonth() + 1);
        graceDate.setDate(5);
        
        return now > graceDate;
      };
      
      // Calcular instalamentos en mora
      const overdueInstallments = allInstallments.filter(inst => isInstallmentOverdue(inst));
      const overdueRate = (overdueInstallments.length / allInstallments.length) * 100 || 0;
      
      // Calcular la tasa del mes anterior para comparación
      const lastMonthDueDate = new Date(lastMonthYear, lastMonth + 1, 5);
      
      const lastMonthInstallments = await prisma.Installments.findMany({
        where: {
          paymentDate: {
            lt: lastMonthDueDate
          },
          Investments: {
            type: 'subscription',
            status: { not: 'declined' }
          }
        },
        include: {
          Transactions: {
            where: { 
              status: 'APPROVED',
              createdAt: { lt: lastMonthDueDate }
            }
          }
        }
      });
      
      const wasInstallmentOverdueLastMonth = (installment) => {
        if (installment.Transactions.length > 0) return false;
        
        const dueDate = new Date(installment.paymentDate);
        const graceDate = new Date(dueDate);
        graceDate.setMonth(dueDate.getMonth() + 1);
        graceDate.setDate(5);
        
        return lastMonthDueDate > graceDate;
      };
      
      const lastMonthOverdueInstallments = lastMonthInstallments.filter(inst => wasInstallmentOverdueLastMonth(inst));
      const lastMonthOverdueRate = (lastMonthOverdueInstallments.length / lastMonthInstallments.length) * 100 || 0;
      
      const overdueRateChange = overdueRate - lastMonthOverdueRate;
      
      // 6. Recaudación mensual y cambio
      const monthlyCollection = thisMonthIncome;
      const monthlyCollectionChange = lastMonthIncome === 0 ? 0 : 
        ((thisMonthIncome - lastMonthIncome) / lastMonthIncome) * 100;
      
      // Enviar datos
      res.json({
        totalIncome,
        lastMonthIncome,
        thisMonthIncome,
        totalActiveSubscriptions: activeSubscriptions,
        newSubscriptions,
        overdueRate,
        overdueRateChange,
        monthlyCollection,
        monthlyCollectionChange
      });
      
    } catch (error) {
      console.error('Error obteniendo estadísticas del dashboard:', error);
      res.status(500).json({ error: 'Error obteniendo estadísticas del dashboard' });
    }
  };