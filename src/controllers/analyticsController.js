/**
 * Obtiene comparativa de dinero esperado vs real por mes
 */
exports.getExpectedVsActual = async (req, res) => {
  try {
    const prisma = req.prisma;
    
    // Verificar que prisma esté disponible
    if (!prisma) {
      console.error('Prisma no está disponible en la solicitud');
      return res.status(500).json({ error: 'Error de configuración del servidor' });
    }
    
    const { year } = req.query;
    
    // Determinar el año de análisis (por defecto el actual)
    const analysisYear = year ? parseInt(year) : new Date().getFullYear();
    
    // Obtener todas las cuotas con sus transacciones para el año
    const installments = await prisma.Installments.findMany({
      where: {
        paymentDate: {
          gte: new Date(`${analysisYear}-01-01`),
          lt: new Date(`${analysisYear + 1}-01-01`)
        },
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
    
    // Preparar datos mensuales
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthlyData = monthNames.map((name, month) => {
      // Filtrar cuotas del mes
      const monthInstallments = installments.filter(inst => 
        new Date(inst.paymentDate).getMonth() === month
      );
      
      // Calcular dinero esperado (suma de totalValue)
      const expected = monthInstallments.reduce(
        (sum, inst) => sum + inst.totalValue, 
        0
      );
      
      // Calcular dinero real (transacciones aprobadas - fees)
      const actual = monthInstallments.reduce(
        (sum, inst) => sum + inst.Transactions.reduce(
          (tSum, t) => tSum + (t.value - (t.paymentMethodFee || 0)),
          0
        ),
        0
      );
      
      return {
        name,
        expected,
        actual,
        difference: actual - expected
      };
    });
    
    res.json(monthlyData);
  } catch (error) {
    console.error('Error obteniendo datos financieros:', error);
    res.status(500).json({ error: 'Error obteniendo datos financieros' });
  }
};

  /**
 * Obtiene datos de mora mensual y acumulada
 */
  exports.getMonthlyOverdue = async (req, res) => {
    try {
      const prisma = req.prisma;
      
      // Verificar que prisma esté disponible
      if (!prisma) {
        console.error('Prisma no está disponible en la solicitud');
        return res.status(500).json({ error: 'Error de configuración del servidor' });
      }
      
      const { year } = req.query;
      
      // Determinar el año de análisis
      const analysisYear = year ? parseInt(year) : new Date().getFullYear();
      
      // Obtener todas las cuotas del año
      const installments = await prisma.Installments.findMany({
        where: {
          paymentDate: {
            gte: new Date(`${analysisYear}-01-01`),
            lt: new Date(`${analysisYear + 1}-01-01`)
          },
          Investments: {
            type: 'subscription',
            status: { not: 'declined' }
          }
        },
        include: {
          Transactions: {
            where: { status: 'APPROVED' }
          }
        },
        orderBy: {
          paymentDate: 'asc'
        }
      });
      
      // Función para verificar si una cuota está en mora
      // Una cuota está en mora si no se pagó antes del día 5 del mes siguiente
      const isInstallmentOverdue = (installment, analysisYear) => {
        // Si tiene transacción aprobada, no está en mora
        if (installment.Transactions.length > 0) return false;
        
        const dueDate = new Date(installment.paymentDate);
        // Si la cuota no es del año en análisis, no procesarla
        if (dueDate.getFullYear() !== analysisYear) return false;

        // Calcular fecha límite (día 5 del mes siguiente)
        const graceDate = new Date(dueDate);
        graceDate.setMonth(dueDate.getMonth() + 1);
        graceDate.setDate(5);

        // Para años pasados, todas las cuotas sin pago están en mora
        if (analysisYear < new Date().getFullYear()) {
          return true;
        }
        
        // Está en mora si la fecha actual es después de la fecha límite
        return new Date() > graceDate;
      };
      
      // Preparar datos mensuales
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      let accumulatedOverdue = 0;
      
      const monthlyData = monthNames.map((name, month) => {
        // Filtrar cuotas en mora para este mes DEL AÑO EN ANÁLISIS
        const overdueInstallments = installments.filter(inst => {
          const instDate = new Date(inst.paymentDate);
          return instDate.getMonth() === month && instDate.getFullYear() === analysisYear &&
            isInstallmentOverdue(inst, analysisYear);
        });
        // Calcular mora del mes
        const monthlyOverdue = overdueInstallments.reduce(
          (sum, inst) => sum + inst.totalValue, 
          0
        );
        
        // Acumular mora
        accumulatedOverdue += monthlyOverdue;
        
        return {
          name,
          monthly: monthlyOverdue,
          accumulated: accumulatedOverdue
        };
      });
      
      res.json(monthlyData);
    } catch (error) {
      console.error('Error obteniendo datos de mora:', error);
      res.status(500).json({ error: 'Error obteniendo datos de mora' });
    }
  };

/**
 * Obtiene datos de mora por proyecto
 */
exports.getOverdueByProject = async (req, res) => {
  try {
    const prisma = req.prisma;
    
    // Verificar que prisma esté disponible
    if (!prisma) {
      console.error('Prisma no está disponible en la solicitud');
      return res.status(500).json({ error: 'Error de configuración del servidor' });
    }
    
    // Obtener el año de análisis
    const { year } = req.query;
    const analysisYear = year ? parseInt(year) : new Date().getFullYear();
    
    // Obtener todos los proyectos con inversiones y cuotas
    const projects = await prisma.Projects.findMany({
      where: {
        deletedAt: null
      },
      include: {
        Investments: {
          where: {
            type: 'subscription',
            status: { not: 'declined' }
          },
          include: {
            Installments: {
              where: {
                paymentDate: {
                  gte: new Date(`${analysisYear}-01-01`),
                  lt: new Date(`${analysisYear + 1}-01-01`)
                }
              },
              include: {
                Transactions: {
                  where: { status: 'APPROVED' }
                }
              }
            }
          }
        }
      }
    });
    
    // Función para verificar mora
    const isInstallmentOverdue = (installment, analysisYear) => {
      if (installment.Transactions.length > 0) return false;
      
      const dueDate = new Date(installment.paymentDate);

      // Si la cuota no es del año en análisis, no procesarla
      if (dueDate.getFullYear() !== analysisYear) return false;
      
      // Calcular fecha límite (día 5 del mes siguiente)
      const graceDate = new Date(dueDate);
      graceDate.setMonth(dueDate.getMonth() + 1);
      graceDate.setDate(5);

      // Para años pasados, todas las cuotas sin pago están en mora
      if (analysisYear < new Date().getFullYear()) {
        return true;
      }
      
      // Está en mora si la fecha actual es después de la fecha límite
      return new Date() > graceDate;
    };
    
    // Calcular mora por proyecto
    let projectOverdueData = projects.map(project => {
      let amount = 0;
      
      // Sumar mora de todas las inversiones del proyecto
      project.Investments.forEach(investment => {
        investment.Installments.forEach(installment => {
          if (isInstallmentOverdue(installment, analysisYear)) {
            amount += installment.totalValue;
          }
        });
      });
      
      return {
        name: project.name,
        amount
      };
    });
    
    // Filtrar proyectos sin mora
    projectOverdueData = projectOverdueData.filter(p => p.amount > 0);
    
    // Calcular porcentajes (evitar división por cero)
    const totalOverdue = projectOverdueData.reduce((sum, p) => sum + p.amount, 0);
    projectOverdueData = projectOverdueData.map(p => ({
      ...p,
      percentage: totalOverdue > 0 ? Math.round((p.amount / totalOverdue) * 100) : 0
    }));
    
    // Ordenar de mayor a menor
    projectOverdueData.sort((a, b) => b.amount - a.amount);
    
    res.json(projectOverdueData);
  } catch (error) {
    console.error('Error obteniendo mora por proyecto:', error);
    res.status(500).json({ error: 'Error obteniendo mora por proyecto' });
  }
};