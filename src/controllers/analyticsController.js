/**
 * Obtiene comparativa de dinero esperado vs real por mes
 */
exports.getExpectedVsActual = async (req, res) => {
    try {
      const { prisma } = req;
      const { year } = req.query;
      
      // Determinar el año de análisis (por defecto el actual)
      const analysisYear = year ? parseInt(year) : new Date().getFullYear();
      
      // Obtener todas las cuotas con sus transacciones para el año
      const installments = await prisma.installment.findMany({
        where: {
          paymentDate: {
            gte: new Date(`${analysisYear}-01-01`),
            lt: new Date(`${analysisYear + 1}-01-01`)
          },
          investment: {
            type: 'subscription',
            status: { not: 'declined' }
          }
        },
        include: {
          transactions: {
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
          (sum, inst) => sum + inst.transactions.reduce(
            (tSum, t) => tSum + (t.value - t.paymentMethodFee),
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
      const { prisma } = req;
      const { year } = req.query;
      
      // Determinar el año de análisis
      const analysisYear = year ? parseInt(year) : new Date().getFullYear();
      
      // Obtener todas las cuotas del año
      const installments = await prisma.installment.findMany({
        where: {
          paymentDate: {
            gte: new Date(`${analysisYear}-01-01`),
            lt: new Date(`${analysisYear + 1}-01-01`)
          },
          investment: {
            type: 'subscription',
            status: { not: 'declined' }
          }
        },
        include: {
          transactions: {
            where: { status: 'APPROVED' }
          }
        },
        orderBy: {
          paymentDate: 'asc'
        }
      });
      
      // Función para verificar si una cuota está en mora
      // Una cuota está en mora si no se pagó antes del día 5 del mes siguiente
      const isInstallmentOverdue = (installment) => {
        // Si tiene transacción aprobada, no está en mora
        if (installment.transactions.length > 0) return false;
        
        const dueDate = new Date(installment.paymentDate);
        
        // Calcular fecha límite (día 5 del mes siguiente)
        const graceDate = new Date(dueDate);
        graceDate.setMonth(dueDate.getMonth() + 1);
        graceDate.setDate(5);
        
        // Está en mora si la fecha actual es después de la fecha límite
        return new Date() > graceDate;
      };
      
      // Preparar datos mensuales
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      let accumulatedOverdue = 0;
      
      const monthlyData = monthNames.map((name, month) => {
        // Filtrar cuotas en mora para este mes
        const overdueInstallments = installments.filter(inst => 
          new Date(inst.paymentDate).getMonth() === month && 
          isInstallmentOverdue(inst)
        );
        
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
      const { prisma } = req;
      
      // Obtener todos los proyectos con inversiones y cuotas
      const projects = await prisma.project.findMany({
        where: {
          deletedAt: null
        },
        include: {
          investments: {
            where: {
              type: 'subscription',
              status: { not: 'declined' }
            },
            include: {
              installments: {
                include: {
                  transactions: {
                    where: { status: 'APPROVED' }
                  }
                }
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
      
      // Calcular mora por proyecto
      let projectOverdueData = projects.map(project => {
        let amount = 0;
        
        // Sumar mora de todas las inversiones del proyecto
        project.investments.forEach(investment => {
          investment.installments.forEach(installment => {
            if (isInstallmentOverdue(installment)) {
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
      
      // Calcular porcentajes
      const totalOverdue = projectOverdueData.reduce((sum, p) => sum + p.amount, 0);
      projectOverdueData = projectOverdueData.map(p => ({
        ...p,
        percentage: Math.round((p.amount / totalOverdue) * 100)
      }));
      
      // Ordenar de mayor a menor
      projectOverdueData.sort((a, b) => b.amount - a.amount);
      
      res.json(projectOverdueData);
    } catch (error) {
      console.error('Error obteniendo mora por proyecto:', error);
      res.status(500).json({ error: 'Error obteniendo mora por proyecto' });
    }
  };