// src/services/apiService.js - ACTUALIZADO PARA RENDER
// 🚨 URL CORREGIDA PARA RENDER
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://backend-c2aj.onrender.com';

class APIService {
  constructor() {
    // 🆕 CONFIGURACIÓN DE TIMEOUT Y RETRY
    this.timeout = 30000; // 30 segundos para Render (puede ser lento)
    this.retryAttempts = 3;
    
    console.log(`🌐 API Service inicializado con URL: ${API_BASE_URL}`);
  }

  // 🆕 MÉTODO PARA HACER PETICIONES CON RETRY Y TIMEOUT
  async fetchWithRetry(url, options = {}, attempt = 1) {
    try {
      console.log(`📡 Petición ${attempt}/${this.retryAttempts}: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.warn(`⚠️ Intento ${attempt} falló:`, error.message);
      
      if (attempt < this.retryAttempts && !error.name === 'AbortError') {
        console.log(`🔄 Reintentando en 2 segundos...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      
      throw error;
    }
  }

  // ========== RECOLECCIÓN DE DATOS ==========

  async collectSample(category, label, landmarks, metadata = {}) {
    try {
      console.log(`📤 Enviando muestra: ${category}/${label}`);
      
      const response = await this.fetchWithRetry(`${API_BASE_URL}/collect/sample/landmarks`, {
        method: 'POST',
        body: JSON.stringify({
          category,
          label,
          landmarks,
          timestamp: new Date().toISOString(),
          metadata
        })
      });

      const result = await response.json();
      console.log(`✅ Muestra enviada exitosamente`);
      return result;
    } catch (error) {
      console.error('❌ Error enviando muestra:', error);
      throw error;
    }
  }

  async collectBatchSamples(category, samples) {
    try {
      console.log(`📦 Enviando lote de ${samples.length} muestras`);
      
      const samplesWithMetadata = samples.map(sample => ({
        ...sample,
        category,
        timestamp: new Date().toISOString()
      }));

      const response = await this.fetchWithRetry(`${API_BASE_URL}/collect/batch/landmarks`, {
        method: 'POST',
        body: JSON.stringify(samplesWithMetadata)
      });

      const result = await response.json();
      console.log(`✅ Lote enviado exitosamente`);
      return result;
    } catch (error) {
      console.error('❌ Error enviando lote de muestras:', error);
      throw error;
    }
  }

  async getDatasetStatus(category) {
    try {
      console.log(`🔍 Obteniendo estado del dataset: ${category}`);
      
      const response = await this.fetchWithRetry(`${API_BASE_URL}/collect/dataset/${category}/summary`);
      const result = await response.json();
      
      console.log(`✅ Estado obtenido para ${category}`);
      return result;
    } catch (error) {
      console.error('❌ Error obteniendo estado del dataset:', error);
      throw error;
    }
  }

  async clearCategoryData(category) {
    try {
      console.log(`🗑️ Eliminando datos de categoría: ${category}`);
      
      const response = await this.fetchWithRetry(`${API_BASE_URL}/collect/clear/${category}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      console.log(`✅ Datos eliminados de ${category}`);
      return result;
    } catch (error) {
      console.error('❌ Error eliminando datos de categoría:', error);
      throw error;
    }
  }

  async clearLabelData(category, label) {
    try {
      console.log(`🗑️ Eliminando etiqueta ${label} de ${category}`);
      
      const response = await this.fetchWithRetry(`${API_BASE_URL}/collect/clear/${category}?label=${label}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      console.log(`✅ Etiqueta ${label} eliminada`);
      return result;
    } catch (error) {
      console.error('❌ Error eliminando datos de etiqueta:', error);
      throw error;
    }
  }

  // ========== ENTRENAMIENTO ==========

  async startTraining(category, options = {}) {
    try {
      console.log(`🧠 Iniciando entrenamiento: ${category}`);
      
      const requestBody = {
        model_name: options.name || 'default',
        epochs: options.epochs || 50,
        batch_size: options.batch_size || 16,
        learning_rate: options.learning_rate || 0.001
      };

      const response = await this.fetchWithRetry(`${API_BASE_URL}/train/${category}/advanced`, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();
      console.log(`✅ Entrenamiento iniciado para ${category}`);
      return result;
    } catch (error) {
      console.error('❌ Error iniciando entrenamiento:', error);
      throw error;
    }
  }

  async getTrainingProgress(category) {
    try {
      const response = await this.fetchWithRetry(`${API_BASE_URL}/train/progress/${category}`);
      return await response.json();
    } catch (error) {
      console.error('❌ Error verificando progreso:', error);
      throw error;
    }
  }

  async getTrainingModels(category) {
    try {
      const response = await this.fetchWithRetry(`${API_BASE_URL}/train/${category}/models`);
      return await response.json();
    } catch (error) {
      console.error('❌ Error obteniendo modelos de entrenamiento:', error);
      throw error;
    }
  }

  async deleteModel(category, modelName) {
    try {
      const response = await this.fetchWithRetry(`${API_BASE_URL}/train/${category}/models/${modelName}`, {
        method: 'DELETE'
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Error eliminando modelo:', error);
      throw error;
    }
  }

  async getModelInfo(category, modelName) {
    try {
      const response = await this.fetchWithRetry(`${API_BASE_URL}/train/${category}/models/${modelName}/info`);
      return await response.json();
    } catch (error) {
      console.error('❌ Error obteniendo información del modelo:', error);
      throw error;
    }
  }

  // ========== 🚨 DESCARGA DE MODELOS (URL CORREGIDA) ==========

  async getAvailableModelsForDownload() {
    try {
      console.log('🔍 Obteniendo modelos disponibles para descarga...');
      
      const response = await this.fetchWithRetry(`${API_BASE_URL}/train/models/available`);
      
      const data = await response.json();
      console.log(`✅ Encontrados ${data.total || 0} modelos disponibles para descarga`);
      
      return data;
    } catch (error) {
      console.error('❌ Error obteniendo modelos disponibles:', error);
      
      // 🆕 FALLBACK: Si no hay modelos, devolver estructura vacía
      if (error.message.includes('404')) {
        console.log('ℹ️ No hay modelos disponibles en el backend');
        return { models: [], total: 0 };
      }
      
      throw error;
    }
  }

  async getModelDownloadInfo(category, modelName) {
    try {
      console.log(`📋 Obteniendo información de descarga para: ${category}/${modelName}`);
      
      const response = await this.fetchWithRetry(`${API_BASE_URL}/train/download/model/${category}/${modelName}/info`);
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
      
      const response = await this.fetchWithRetry(url);
      
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

      const response = await this.fetchWithRetry(`${API_BASE_URL}/predict/${category}/predict`, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      return await response.json();
    } catch (error) {
      console.error('❌ Error en predicción:', error);
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

      const response = await this.fetchWithRetry(`${API_BASE_URL}/predict/${category}/batch-predict`, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      return await response.json();
    } catch (error) {
      console.error('❌ Error en predicción batch:', error);
      throw error;
    }
  }

  async getAvailableModels() {
    try {
      const response = await this.fetchWithRetry(`${API_BASE_URL}/predict/available`);
      return await response.json();
    } catch (error) {
      console.error('❌ Error obteniendo modelos disponibles:', error);
      return { available_models: [], categories: {}, total: 0 };
    }
  }

  async getCategoryModels(category) {
    try {
      const response = await this.fetchWithRetry(`${API_BASE_URL}/predict/${category}/models`);
      return await response.json();
    } catch (error) {
      console.error('❌ Error obteniendo modelos de categoría:', error);
      return { category, models: [], total: 0, default_model: null };
    }
  }

  async getDetailedModelInfo(category, modelName) {
    try {
      const response = await this.fetchWithRetry(`${API_BASE_URL}/predict/${category}/${modelName}/info`);
      return await response.json();
    } catch (error) {
      console.error('❌ Error obteniendo información detallada:', error);
      throw error;
    }
  }

  async loadModel(category, modelName) {
    try {
      const response = await this.fetchWithRetry(`${API_BASE_URL}/predict/load-model`, {
        method: 'POST',
        body: JSON.stringify({ category, model_name: modelName })
      });

      return await response.json();
    } catch (error) {
      console.error('❌ Error cargando modelo:', error);
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

      const response = await this.fetchWithRetry(`${API_BASE_URL}/predict/${category}/practice/check`, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      return await response.json();
    } catch (error) {
      console.error('❌ Error en práctica de predicción:', error);
      throw error;
    }
  }

  // ========== DESCARGA DE DATOS PARA ENTRENAMIENTO ==========

  async downloadTrainingData(category) {
    try {
      console.log(`📥 Descargando datos de entrenamiento para: ${category}`);

      const response = await this.fetchWithRetry(`${API_BASE_URL}/train/${category}/download-training-data`);
      const data = await response.json();

      console.log(`✅ Datos descargados exitosamente:`, {
        categoria: data.category,
        muestras: data.statistics?.total_samples,
        etiquetas: data.statistics?.total_labels,
        labels: data.labels
      });

      return data;
    } catch (error) {
      console.error(`❌ Error descargando datos de ${category}:`, error);
      throw error;
    }
  }

  // ========== 🆕 VERIFICACIÓN DE CONECTIVIDAD MEJORADA ==========

  async checkBackendConnection() {
    try {
      console.log('🔍 Verificando conexión con el backend...');
      
      // 🚨 USAR ENDPOINT DE SALUD EN LUGAR DE MODELOS
      const response = await this.fetchWithRetry(`${API_BASE_URL}/health`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Conexión con backend establecida:', data);
        return { connected: true, status: 'online', data };
      } else {
        console.warn(`⚠️ Backend respondió con status: ${response.status}`);
        return { connected: false, status: 'error', code: response.status };
      }
    } catch (error) {
      console.error('❌ Error de conectividad:', error.message);
      
      if (error.name === 'AbortError') {
        return { connected: false, status: 'timeout', error: 'Timeout de conexión (Render puede estar durmiendo)' };
      }
      
      return { connected: false, status: 'offline', error: error.message };
    }
  }

  // ========== UTILIDADES ==========

  async corsTest() {
    try {
      console.log('🧪 Probando CORS...');
      
      const response = await this.fetchWithRetry(`${API_BASE_URL}/cors-test`);
      const result = await response.json();
      
      console.log('✅ CORS funcionando:', result);
      return result;
    } catch (error) {
      console.error('❌ Error en test CORS:', error);
      throw error;
    }
  }

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

// 🆕 TEST INICIAL DE CONECTIVIDAD
apiService.checkBackendConnection().then(result => {
  if (result.connected) {
    console.log('🎉 Backend conectado exitosamente al cargar la aplicación');
  } else {
    console.warn('⚠️ Backend no disponible al cargar la aplicación:', result);
  }
}).catch(error => {
  console.warn('⚠️ Error en test inicial de conectividad:', error);
});

export default apiService;