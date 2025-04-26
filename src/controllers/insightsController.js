/**
 * Controlador para generar insights de negocio basados en análisis de datos
 */

// Obtiene la segmentación de clientes según su comportamiento de pago
exports.getCustomerSegmentation = async (req, res) => {
  try {
    const prisma = req.prisma;
    
    // Verificar que prisma esté disponible
    if (!prisma) {
      console.error('Prisma no está disponible en la solicitud');
      return res.status(500).json({ error: 'Error de configuración del servidor' });
    }
    
    // Obtener parámetros de filtro
    const { period = 'year' } = req.query;
    console.log(`Procesando segmentación con período: ${period}`);
    
    // Calcular fechas para el período seleccionado
    const endDate = new Date();
    let startDate;
    
    switch(period) {
      case 'month':
        // Primer día del mes anterior
        startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1);
        break;
      case 'quarter':
        // Primer día del trimestre anterior (3 meses atrás)
        startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 3, 1);
        break;
      case 'year':
        // Primer día del año anterior
        startDate = new Date(endDate.getFullYear() - 1, 0, 1);
        break;
      case 'all':
      default:
        startDate = new Date(0); // Desde el inicio
        break;
    }
    
    console.log(`Filtro de fechas: desde ${startDate.toISOString()} hasta ${endDate.toISOString()}`);
    
    // Obtener inversiones tipo suscripción con sus cuotas y transacciones
    const investmentsWithData = await prisma.Investments.findMany({
      where: {
        type: 'subscription',
        status: { not: 'declined' },
        Installments: {
          some: {
            paymentDate: {
              gte: startDate,
              lte: endDate
            }
          }
        }
      },
      select: {
        id: true,
        email: true,
        investmentValue: true,
        Installments: {
          where: {
            paymentDate: {
              gte: startDate,
              lte: endDate
            }
          },
          select: {
            id: true,
            paymentDate: true,
            totalValue: true,
            Transactions: {
              where: {
                status: 'APPROVED'
              },
              select: {
                id: true,
                createdAt: true,
                value: true,
                paymentMethodFee: true
              }
            }
          }
        }
      }
    });
    
    console.log(`Datos recuperados: ${investmentsWithData.length} inversiones`);
    
    // Analizar comportamiento de pago
    const clientAnalysis = analyzeClientPaymentBehavior(investmentsWithData);
    console.log(`Clientes analizados: ${clientAnalysis.length}`);
    
    // Segmentar clientes y calcular métricas
    const segments = segmentClients(clientAnalysis);
    const segmentMetrics = calculateSegmentMetrics(segments, clientAnalysis);
    
    // Devolver resultados con metadatos
    res.json({
      segments: segmentMetrics,
      period: period,
      metadata: {
        timeFrame: {
          from: startDate,
          to: endDate
        },
        totalClients: clientAnalysis.length,
        segmentDistribution: Object.keys(segments).reduce((acc, key) => {
          acc[key] = segments[key].length;
          return acc;
        }, {})
      }
    });
    
  } catch (error) {
    console.error('Error al analizar segmentación de clientes:', error);
    res.status(500).json({ error: 'Error al analizar segmentación de clientes' });
  }
};

/**
 * Analiza el comportamiento de pago de cada cliente
 * @param {Array} investmentsWithData - Inversiones con sus cuotas y transacciones
 * @returns {Array} - Análisis detallado por cliente
 */
function analyzeClientPaymentBehavior(investmentsWithData) {
  // Mapear los datos por cliente (email)
  const clientsMap = new Map();
  
  investmentsWithData.forEach(investment => {
    const email = investment.email;
    
    if (!clientsMap.has(email)) {
      clientsMap.set(email, {
        email: email,
        totalInstallments: 0,
        paidOnTime: 0,
        paidLate: 0,
        notPaid: 0,
        totalInvestment: 0,
        totalPaid: 0,
        totalOverdue: 0,
        averageDelayDays: 0,
        totalDelayDays: 0,
        investments: []
      });
    }
    
    const clientData = clientsMap.get(email);
    clientData.totalInvestment += investment.investmentValue;
    clientData.investments.push(investment.id);
    
    // Analizar cada cuota
    investment.Installments.forEach(installment => {
      clientData.totalInstallments++;
      
      // Fecha de vencimiento y fecha límite (5 días del mes siguiente)
      const dueDate = new Date(installment.paymentDate);
      const graceDate = new Date(dueDate);
      graceDate.setMonth(dueDate.getMonth() + 1);
      graceDate.setDate(5);
      
      // Verificar si hay transacciones aprobadas
      if (installment.Transactions.length > 0) {
        // Ordenar transacciones por fecha
        const sortedTransactions = [...installment.Transactions].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
        
        // Tomar la primera transacción aprobada
        const paymentDate = new Date(sortedTransactions[0].createdAt);
        
        // Calcular el monto pagado (descontando comisiones)
        const amountPaid = sortedTransactions.reduce(
          (sum, t) => sum + (t.value - (t.paymentMethodFee || 0)), 
          0
        );
        
        clientData.totalPaid += amountPaid;
        
        // Verificar si el pago fue a tiempo o con retraso
        if (paymentDate <= graceDate) {
          clientData.paidOnTime++;
        } else {
          clientData.paidLate++;
          
          // Calcular días de retraso
          const delayDays = Math.floor((paymentDate - graceDate) / (1000 * 60 * 60 * 24));
          clientData.totalDelayDays += delayDays;
        }
      } else {
        // Si no hay transacción, verificar si está en mora
        if (new Date() > graceDate) {
          clientData.notPaid++;
          clientData.totalOverdue += installment.totalValue;
        }
      }
    });
    
    // Actualizar el mapa
    clientsMap.set(email, clientData);
  });
  
  // Calcular métricas adicionales para cada cliente
  const clientsArray = [];
  for (let [_, clientData] of clientsMap) {
    // Calcular promedio de días de retraso
    if (clientData.paidLate > 0) {
      clientData.averageDelayDays = parseFloat((clientData.totalDelayDays / clientData.paidLate).toFixed(1));
    }
    
    // Calcular porcentajes
    clientData.onTimePercentage = clientData.totalInstallments > 0 
      ? parseFloat(((clientData.paidOnTime / clientData.totalInstallments) * 100).toFixed(1))
      : 0;
      
    clientData.latePercentage = clientData.totalInstallments > 0 
      ? parseFloat(((clientData.paidLate / clientData.totalInstallments) * 100).toFixed(1))
      : 0;
      
    clientData.unpaidPercentage = clientData.totalInstallments > 0 
      ? parseFloat(((clientData.notPaid / clientData.totalInstallments) * 100).toFixed(1))
      : 0;
      
    clientsArray.push(clientData);
  }
  
  return clientsArray;
}

/**
 * Segmenta a los clientes según su comportamiento de pago
 * @param {Array} clientAnalysis - Análisis de clientes
 * @returns {Object} - Clientes agrupados por segmento
 */
function segmentClients(clientAnalysis) {
  // Definir los segmentos
  const segments = {
    'reliable': [], // Siempre puntuales (>90% pagos a tiempo)
    'occasional': [], // Ocasionalmente retrasados (70-90% pagos a tiempo)
    'frequent': [], // Frecuentemente retrasados (40-70% pagos a tiempo)
    'chronic': []   // Crónicamente morosos (<40% pagos a tiempo)
  };
  
  // Segmentar cada cliente
  clientAnalysis.forEach(client => {
    // Solo considerar clientes con al menos 2 cuotas para evitar clasificaciones prematuras
    if (client.totalInstallments >= 2) {
      if (client.onTimePercentage >= 90) {
        segments.reliable.push(client.email);
      } else if (client.onTimePercentage >= 70) {
        segments.occasional.push(client.email);
      } else if (client.onTimePercentage >= 40) {
        segments.frequent.push(client.email);
      } else {
        segments.chronic.push(client.email);
      }
    } else {
      // Para clientes con pocas cuotas, colocarlos según lo que tengan
      if (client.unpaidPercentage > 0) {
        segments.chronic.push(client.email);
      } else if (client.latePercentage > 0) {
        segments.occasional.push(client.email);
      } else {
        segments.reliable.push(client.email);
      }
    }
  });
  
  return segments;
}

/**
 * Calcula métricas agregadas para cada segmento
 * @param {Object} segments - Segmentos de clientes
 * @param {Array} clientAnalysis - Análisis detallado de clientes
 * @returns {Array} - Métricas por segmento
 */
function calculateSegmentMetrics(segments, clientAnalysis) {
  const segmentMetrics = {
    reliable: { 
      name: 'Siempre puntuales',
      color: '#4caf50', // Verde
      count: segments.reliable.length,
      totalInvestment: 0,
      averagePaymentDelay: 0,
      totalOverdue: 0,
      description: 'Clientes que pagan al menos el 90% de sus cuotas a tiempo.'
    },
    occasional: {
      name: 'Ocasionalmente retrasados',
      color: '#2196f3', // Azul
      count: segments.occasional.length,
      totalInvestment: 0,
      averagePaymentDelay: 0,
      totalOverdue: 0,
      description: 'Clientes que pagan entre el 70% y 90% de sus cuotas a tiempo.'
    },
    frequent: {
      name: 'Frecuentemente retrasados',
      color: '#ff9800', // Naranja
      count: segments.frequent.length,
      totalInvestment: 0,
      averagePaymentDelay: 0,
      totalOverdue: 0,
      description: 'Clientes que pagan entre el 40% y 70% de sus cuotas a tiempo.'
    },
    chronic: {
      name: 'Crónicamente morosos',
      color: '#f44336', // Rojo
      count: segments.chronic.length,
      totalInvestment: 0,
      averagePaymentDelay: 0,
      totalOverdue: 0,
      description: 'Clientes que pagan menos del 40% de sus cuotas a tiempo.'
    }
  };
  
  // Calcular métricas para cada segmento
  Object.keys(segments).forEach(segmentName => {
    const emailsInSegment = segments[segmentName];
    let totalDelayDays = 0;
    let totalLatePayments = 0;
    
    emailsInSegment.forEach(email => {
      const client = clientAnalysis.find(c => c.email === email);
      if (client) {
        segmentMetrics[segmentName].totalInvestment += client.totalInvestment;
        segmentMetrics[segmentName].totalOverdue += client.totalOverdue;
        totalDelayDays += client.totalDelayDays;
        totalLatePayments += client.paidLate;
      }
    });
    
    // Calcular promedio de días de retraso
    if (totalLatePayments > 0) {
      segmentMetrics[segmentName].averagePaymentDelay = parseFloat((totalDelayDays / totalLatePayments).toFixed(1));
    }
    
    // Calcular porcentaje de inversión
    const totalInvestment = clientAnalysis.reduce((sum, client) => sum + client.totalInvestment, 0) || 1;
    segmentMetrics[segmentName].investmentPercentage = parseFloat((segmentMetrics[segmentName].totalInvestment / totalInvestment * 100).toFixed(1));
      
    // Calcular porcentaje de mora
    const totalOverdue = clientAnalysis.reduce((sum, client) => sum + client.totalOverdue, 0) || 1;
    segmentMetrics[segmentName].overduePercentage = parseFloat((segmentMetrics[segmentName].totalOverdue / totalOverdue * 100).toFixed(1));
  });
  
  // Convertir a array para facilitar visualización
  return Object.values(segmentMetrics);
}