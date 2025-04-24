/**
 * Analiza patrones de pago y mora
 */
exports.getPaymentPatterns = async (req, res) => {
    try {
      const { prisma } = req;
      
      // 1. Análisis de comportamiento de pago
      const paymentBehavior = await analyzePaymentBehavior(prisma);
      
      // 2. Análisis de proyectos con mayor mora
      const projectAnalysis = await analyzeProjectPerformance(prisma);
      
      // 3. Análisis de tendencias temporales
      const timeAnalysis = await analyzeTimePatterns(prisma);
      
      // Combinar todos los análisis en una respuesta
      res.json({
        paymentBehavior,
        projectAnalysis,
        timeAnalysis,
        insights: generateInsights(paymentBehavior, projectAnalysis, timeAnalysis)
      });
    } catch (error) {
      console.error('Error generando insights:', error);
      res.status(500).json({ error: 'Error generando insights' });
    }
  };
  
  // Funciones de análisis
  async function analyzePaymentBehavior(prisma) {
    // Código de análisis de patrones de pago
    // ...
  }
  
  async function analyzeProjectPerformance(prisma) {
    // Código de análisis de desempeño por proyecto
    // ...
  }
  
  async function analyzeTimePatterns(prisma) {
    // Código de análisis de patrones temporales
    // ...
  }
  
  function generateInsights(paymentData, projectData, timeData) {
    // Generar recomendaciones basadas en los datos
    const insights = [];
    
    // Ejemplo de reglas para generar insights
    if (paymentData.latePayments > 30) {
      insights.push({
        title: "Alta tasa de pagos tardíos",
        description: "Más del 30% de los pagos se realizan con retraso. Considere implementar recordatorios tempranos.",
        severity: "high"
      });
    }
    
    // Más reglas...
    
    return insights;
  }