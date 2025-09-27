// src/services/apiService.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

class APIService {
  // ========== RECOLECCIÓN DE DATOS ==========

  async collectSample(category, label, landmarks, metadata = {}) {
    try {
      const response = await fetch(`${API_BASE_URL}/collect/sample/landmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          label,
          landmarks,
          timestamp: new Date().toISOString(),
          metadata
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error enviando muestra:', error);
      throw error;
    }
  }

  async collectBatchSamples(category, samples) {
    try {
      const samplesWithMetadata = samples.map(sample => ({
        ...sample,
        category,
        timestamp: new Date().toISOString()
      }));

      const response = await fetch(`${API_BASE_URL}/collect/batch/landmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(samplesWithMetadata)
      });

      return await response.json();
    } catch (error) {
      console.error('Error enviando lote de muestras:', error);
      throw error;
    }
  }

  async getDatasetStatus(category) {
    try {
      const response = await fetch(`${API_BASE_URL}/collect/dataset/${category}/summary`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo estado del dataset:', error);
      throw error;
    }
  }

  async clearCategoryData(category) {
    try {
      const response = await fetch(`${API_BASE_URL}/collect/clear/${category}`, {
        method: 'DELETE'
      });
      return await response.json();
    } catch (error) {
      console.error('Error eliminando datos de categoría:', error);
      throw error;
    }
  }

  async clearLabelData(category, label) {
    try {
      const response = await fetch(`${API_BASE_URL}/collect/clear/${category}?label=${label}`, {
        method: 'DELETE'
      });
      return await response.json();
    } catch (error) {
      console.error('Error eliminando datos de etiqueta:', error);
      throw error;
    }
  }

  // ========== ENTRENAMIENTO ==========

  async startTraining(category, options = {}) {
    try {
      const requestBody = {
        model_name: options.name || 'default',
        epochs: options.epochs || 50,
        batch_size: options.batch_size || 16,
        learning_rate: options.learning_rate || 0.001
      };

      const response = await fetch(`${API_BASE_URL}/train/${category}/advanced`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error iniciando entrenamiento:', error);
      throw error;
    }
  }

  async getTrainingProgress(category) {
    try {
      const response = await fetch(`${API_BASE_URL}/train/progress/${category}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error verificando progreso:', error);
      throw error;
    }
  }

  async getTrainingModels(category) {
    try {
      const response = await fetch(`${API_BASE_URL}/train/${category}/models`);
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo modelos de entrenamiento:', error);
      throw error;
    }
  }

  async deleteModel(category, modelName) {
    try {
      const response = await fetch(`${API_BASE_URL}/train/${category}/models/${modelName}`, {
        method: 'DELETE'
      });
      return await response.json();
    } catch (error) {
      console.error('Error eliminando modelo:', error);
      throw error;
    }
  }

  async getModelInfo(category, modelName) {
    try {
      const response = await fetch(`${API_BASE_URL}/train/${category}/models/${modelName}/info`);
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo información del modelo:', error);
      throw error;
    }
  }

  // ========== PREDICCIÓN ==========

  async predict(category, landmarks, options = {}) {
    try {
      const requestBody = {
        landmarks,
        confidence_threshold: options.threshold || 0.7,
        return_all_probabilities: options.returnAll || false,
        model_name: options.modelName || null
      };

      const response = await fetch(`${API_BASE_URL}/predict/${category}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error en predicción:', error);
      throw error;
    }
  }

  async predictBatch(category, landmarksBatch, options = {}) {
    try {
      const requestBody = {
        landmarks_batch: landmarksBatch,
        model_name: options.modelName || null,
        confidence_threshold: options.threshold || 0.7
      };

      const response = await fetch(`${API_BASE_URL}/predict/${category}/batch-predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      return await response.json();
    } catch (error) {
      console.error('Error en predicción batch:', error);
      throw error;
    }
  }

  async getAvailableModels() {
    try {
      const response = await fetch(`${API_BASE_URL}/predict/available`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo modelos disponibles:', error);
      return { available_models: [], categories: {}, total: 0 };
    }
  }

  async getCategoryModels(category) {
    try {
      const response = await fetch(`${API_BASE_URL}/predict/${category}/models`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo modelos de categoría:', error);
      return { category, models: [], total: 0, default_model: null };
    }
  }

  async getDetailedModelInfo(category, modelName) {
    try {
      const response = await fetch(`${API_BASE_URL}/predict/${category}/${modelName}/info`);
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo información detallada:', error);
      throw error;
    }
  }

  async loadModel(category, modelName) {
    try {
      const response = await fetch(`${API_BASE_URL}/predict/load-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, model_name: modelName })
      });

      return await response.json();
    } catch (error) {
      console.error('Error cargando modelo:', error);
      throw error;
    }
  }

  // ========== UTILIDADES ==========

  async pingServer() {
    try {
      const response = await fetch(`${API_BASE_URL}/ping`);
      return await response.json();
    } catch (error) {
      console.error('Error haciendo ping al servidor:', error);
      return { status: 'offline' };
    }
  }

  async getServerInfo() {
    try {
      const response = await fetch(`${API_BASE_URL}/info`);
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo info del servidor:', error);
      throw error;
    }
  }
  async practicePredict(category, landmarks, options = {}) {
    try {
      const requestBody = {
        landmarks,
        confidence_threshold: options.threshold || 0.7,
        model_name: options.modelName || null  // <-- pasar modelName
      };
  
      const response = await fetch(`${API_BASE_URL}/predict/${category}/practice/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
  
      return await response.json();
    } catch (error) {
      console.error('Error en práctica de predicción:', error);
      throw error;
    }
  }
}

const apiService = new APIService();
export default apiService;
