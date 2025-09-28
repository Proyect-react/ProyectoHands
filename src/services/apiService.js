// src/services/apiService.js - VERSIÓN ACTUALIZADA CON DESCARGA DE MODELOS
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

  // ========== 🆕 DESCARGA DE MODELOS ==========

  async getAvailableModelsForDownload() {
    try {
      console.log('🔍 Obteniendo modelos disponibles para descarga...');
      
      const response = await fetch(`${API_BASE_URL}/train/models/available`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('ℹ️ No hay modelos disponibles en el backend');
          return { models: [], total: 0 };
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      console.log(`✅ Encontrados ${data.total} modelos disponibles para descarga`);
      
      return data;
    } catch (error) {
      console.error('❌ Error obteniendo modelos disponibles:', error);
      throw error;
    }
  }

  async getModelDownloadInfo(category, modelName) {
    try {
      console.log(`📋 Obteniendo información de descarga para: ${category}/${modelName}`);
      
      const response = await fetch(`${API_BASE_URL}/train/download/model/${category}/${modelName}/info`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const info = await response.json();
      
      console.log(`✅ Información de descarga obtenida para ${category}/${modelName}`);
      
      return info;
    } catch (error) {
      console.error(`❌ Error obteniendo información de descarga:`, error);
      throw error;
    }
  }

  async downloadModelFile(category, modelName, fileType) {
    try {
      console.log(`⬇️ Descargando ${fileType} para: ${category}/${modelName}`);
      
      const endpoint = fileType === 'model' ? 'model.json' : 'weights.bin';
      const url = `${API_BASE_URL}/train/download/model/${category}/${modelName}/${endpoint}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`✅ ${fileType} descargado exitosamente`);
      
      return response;
    } catch (error) {
      console.error(`❌ Error descargando ${fileType}:`, error);
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

  async practicePredict(category, landmarks, options = {}) {
    try {
      const requestBody = {
        landmarks,
        confidence_threshold: options.threshold || 0.7,
        model_name: options.modelName || null
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

  // ========== DESCARGA DE DATOS PARA ENTRENAMIENTO ==========

  async downloadTrainingData(category) {
    try {
      console.log(`📥 Descargando datos de entrenamiento para: ${category}`);

      const response = await fetch(`${API_BASE_URL}/train/${category}/download-training-data`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      console.log(`✅ Datos descargados exitosamente:`, {
        categoria: data.category,
        muestras: data.statistics.total_samples,
        etiquetas: data.statistics.total_labels,
        labels: data.labels
      });

      return data;

    } catch (error) {
      console.error(`❌ Error descargando datos de ${category}:`, error);
      throw error;
    }
  }

  // ========== 🆕 VERIFICACIÓN DE CONECTIVIDAD ==========

  async checkBackendConnection() {
    try {
      console.log('🔍 Verificando conexión con el backend...');
      
      const response = await fetch(`${API_BASE_URL}/train/models/available`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // Timeout de 5 segundos
      });
      
      if (response.ok) {
        console.log('✅ Conexión con backend establecida');
        return { connected: true, status: 'online' };
      } else {
        console.warn(`⚠️ Backend respondió con status: ${response.status}`);
        return { connected: false, status: 'error', code: response.status };
      }
    } catch (error) {
      console.error('❌ Error de conectividad:', error.message);
      
      if (error.name === 'TimeoutError') {
        return { connected: false, status: 'timeout', error: 'Timeout de conexión' };
      }
      
      return { connected: false, status: 'offline', error: error.message };
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

  // ========== 🆕 MÉTODOS PARA DEBUGGING ==========

  getApiUrl() {
    return API_BASE_URL;
  }

  async testConnection() {
    try {
      const start = Date.now();
      const connection = await this.checkBackendConnection();
      const end = Date.now();
      
      return {
        ...connection,
        responseTime: end - start,
        apiUrl: API_BASE_URL,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        connected: false,
        status: 'error',
        error: error.message,
        apiUrl: API_BASE_URL,
        timestamp: new Date().toISOString()
      };
    }
  }
}

const apiService = new APIService();
export default apiService;