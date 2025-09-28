// src/services/localDataManager.js - VERSIÓN MEJORADA
class LocalDataManager {
  constructor() {
    this.SAMPLES_PER_LABEL = 30;
  }

  saveLocalData(category, label, landmarks) {
    try {
      // Validar landmarks
      if (!landmarks || landmarks.length !== 126) {
        throw new Error(`Landmarks inválidos: se esperaban 126 valores, se recibieron ${landmarks?.length || 0}`);
      }

      const key = `dataset_${category}`;
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      
      if (!existing[label]) {
        existing[label] = [];
      }
      
      if (existing[label].length >= this.SAMPLES_PER_LABEL) {
        throw new Error(`Límite de ${this.SAMPLES_PER_LABEL} muestras alcanzado para ${label}`);
      }
      
      const sample = {
        landmarks: landmarks.map(val => parseFloat(val.toFixed(6))), // Asegurar que sean números
        timestamp: new Date().toISOString(),
        id: Date.now() + Math.random()
      };
      
      existing[label].push(sample);
      localStorage.setItem(key, JSON.stringify(existing));
      
      console.log(`✅ Muestra ${existing[label].length}/${this.SAMPLES_PER_LABEL} guardada para ${label}`);
      
      return {
        current: existing[label].length,
        total: this.SAMPLES_PER_LABEL,
        label,
        category
      };
    } catch (error) {
      console.error('Error guardando datos locales:', error);
      throw error;
    }
  }

  loadTrainingData(category) {
    try {
      const key = `dataset_${category}`;
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      
      const X = [];
      const y = [];
      const labels = Object.keys(data).filter(label => data[label].length > 0);
      
      if (labels.length === 0) {
        throw new Error(`No hay datos para la categoría ${category}`);
      }
      
      console.log(`Cargando datos para categoría ${category}:`, labels);
      
      labels.forEach((label, labelIndex) => {
        console.log(`Procesando ${label}: ${data[label].length} muestras`);
        
        data[label].forEach(sample => {
          // Validar y normalizar landmarks
          if (sample.landmarks && sample.landmarks.length === 126) {
            const normalizedLandmarks = sample.landmarks.map(val => {
              const num = parseFloat(val);
              return isNaN(num) ? 0 : num;
            });
            
            X.push(normalizedLandmarks);
            y.push(labelIndex); // Usar índice numérico para las etiquetas
          }
        });
      });
      
      console.log(`Datos cargados: ${X.length} muestras, ${labels.length} etiquetas`);
      
      return { 
        X: X.slice(0, 1000), // Limitar para evitar problemas de memoria
        y: y.slice(0, 1000), 
        labels 
      };
    } catch (error) {
      console.error('Error cargando datos de entrenamiento:', error);
      return { X: [], y: [], labels: [] };
    }
  }

  getLocalDatasetStatus(category) {
    try {
      const key = `dataset_${category}`;
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      
      const labels = {};
      let totalSamples = 0;
      
      Object.keys(data).forEach(label => {
        const count = data[label].length;
        labels[label] = {
          samples: count,
          progress: (count / this.SAMPLES_PER_LABEL) * 100,
          ready: count >= this.SAMPLES_PER_LABEL
        };
        totalSamples += count;
      });
      
      return {
        category,
        labels,
        totalSamples,
        readyToTrain: Object.values(labels).every(label => label.ready) && Object.keys(labels).length > 0,
        completion: (totalSamples / (Object.keys(labels).length * this.SAMPLES_PER_LABEL)) * 100
      };
    } catch (error) {
      console.error('Error obteniendo estado del dataset:', error);
      return { labels: {}, totalSamples: 0, readyToTrain: false, completion: 0 };
    }
  }

  clearLabelData(category, label) {
    const key = `dataset_${category}`;
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    const previousCount = data[label] ? data[label].length : 0;
    delete data[label];
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`🗑️ Eliminadas ${previousCount} muestras de ${label}`);
  }

  clearCategoryData(category) {
    const key = `dataset_${category}`;
    localStorage.removeItem(key);
    console.log(`🗑️ Eliminados todos los datos de ${category}`);
  }

  // Nuevo método para validar datos
  validateData(category) {
    const key = `dataset_${category}`;
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    
    let validSamples = 0;
    let invalidSamples = 0;
    
    Object.keys(data).forEach(label => {
      data[label].forEach(sample => {
        if (sample.landmarks && sample.landmarks.length === 126) {
          validSamples++;
        } else {
          invalidSamples++;
        }
      });
    });
    
    return { validSamples, invalidSamples, totalSamples: validSamples + invalidSamples };
  }
}

export default new LocalDataManager();