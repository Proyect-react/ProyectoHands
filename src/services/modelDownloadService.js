// src/services/modelDownloadService.js - VERSIÓN COMPLETA Y CORREGIDA PARA RENDER
import * as tf from '@tensorflow/tfjs';

class ModelDownloadService {
  constructor() {
    // 🚨 URL CORREGIDA PARA RENDER (NO localhost)
    this.API_BASE_URL = process.env.REACT_APP_API_URL || 'https://backend-c2aj.onrender.com';
    this.downloadedModels = new Map();
    this.modelCache = new Map(); // Cache en memoria
    this.downloadPromises = new Map(); // Evitar descargas duplicadas
    
    // 🆕 CONFIGURACIÓN PARA RENDER (servidor puede ser lento)
    this.timeout = 45000; // 45 segundos para Render
    this.retryAttempts = 3;
    
    console.log(`🤖 ModelDownloadService inicializado con URL: ${this.API_BASE_URL}`);
  }

  // 🆕 MÉTODO PARA HACER PETICIONES CON RETRY Y TIMEOUT
  async fetchWithRetry(url, options = {}, attempt = 1) {
    try {
      console.log(`📡 Descarga ${attempt}/${this.retryAttempts}: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
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
      console.warn(`⚠️ Intento ${attempt} falló para descarga:`, error.message);
      
      if (attempt < this.retryAttempts && error.name !== 'AbortError') {
        console.log(`🔄 Reintentando descarga en 3 segundos...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      
      throw error;
    }
  }

  // ========== DESCARGA AUTOMÁTICA DE MODELOS ==========

  async checkAndDownloadModels(category = null) {
    try {
      console.log('🔍 Verificando modelos disponibles en el backend...');
      
      // Obtener lista de modelos disponibles
      const availableModels = await this.getAvailableModels();
      
      if (availableModels.length === 0) {
        console.log('ℹ️ No hay modelos disponibles en el backend');
        return { downloaded: [], skipped: [], errors: [] };
      }

      // Filtrar por categoría si se especifica
      const modelsToCheck = category 
        ? availableModels.filter(model => model.category === category)
        : availableModels;

      console.log(`📋 Encontrados ${modelsToCheck.length} modelos para verificar`);

      const results = {
        downloaded: [],
        skipped: [],
        errors: []
      };

      // Verificar y descargar cada modelo
      for (const modelInfo of modelsToCheck) {
        try {
          const shouldDownload = await this.shouldDownloadModel(modelInfo);
          
          if (shouldDownload) {
            console.log(`⬇️ Descargando modelo: ${modelInfo.category}/${modelInfo.model_name}`);
            const downloaded = await this.downloadModel(modelInfo);
            if (downloaded.success) {
              results.downloaded.push(modelInfo);
            } else {
              results.errors.push({ model: modelInfo, error: downloaded.error });
            }
          } else {
            console.log(`✅ Modelo ya actualizado: ${modelInfo.category}/${modelInfo.model_name}`);
            results.skipped.push(modelInfo);
          }
        } catch (error) {
          console.error(`❌ Error procesando modelo ${modelInfo.category}/${modelInfo.model_name}:`, error);
          results.errors.push({ model: modelInfo, error: error.message });
        }
      }

      console.log('📊 Resumen de descarga:', results);
      return results;

    } catch (error) {
      console.error('❌ Error en verificación automática:', error);
      throw error;
    }
  }

  async getAvailableModels() {
    try {
      // 🚨 USAR fetchWithRetry EN LUGAR DE fetch SIMPLE
      const response = await this.fetchWithRetry(`${this.API_BASE_URL}/train/models/available`);
      
      const data = await response.json();
      console.log(`✅ Respuesta del servidor:`, data);
      
      return data.models || [];

    } catch (error) {
      console.error('❌ Error obteniendo modelos disponibles:', error);
      
      // 🆕 MANEJAR CASOS ESPECÍFICOS DE RENDER
      if (error.message.includes('404')) {
        console.log('ℹ️ Backend no tiene modelos disponibles (404)');
        return [];
      }
      
      if (error.name === 'AbortError') {
        console.log('⏰ Timeout conectando al backend (Render puede estar durmiendo)');
        throw new Error('Timeout: El backend puede estar iniciándose. Intenta de nuevo en unos segundos.');
      }
      
      throw error;
    }
  }

  async shouldDownloadModel(modelInfo) {
    try {
      const modelKey = `${modelInfo.category}_${modelInfo.model_name}`;
      
      // Verificar cache local
      const localVersion = localStorage.getItem(`${modelKey}_version`);
      const localTimestamp = localStorage.getItem(`${modelKey}_timestamp`);
      
      // Si no existe localmente, descargar
      if (!localVersion || !localTimestamp) {
        console.log(`📥 Modelo ${modelKey} no existe localmente`);
        return true;
      }

      // Comparar fechas de entrenamiento
      const backendDate = new Date(modelInfo.training_date);
      const localDate = new Date(localTimestamp);
      
      // Si el modelo del backend es más reciente, descargar
      if (backendDate > localDate) {
        console.log(`🔄 Nueva versión disponible para ${modelKey}`);
        return true;
      }

      // Verificar que los archivos realmente existan en IndexedDB
      const exists = await this.modelExistsInIndexedDB(modelKey);
      if (!exists) {
        console.log(`📁 Modelo ${modelKey} no existe en IndexedDB, descargando`);
        return true;
      }

      return false;

    } catch (error) {
      console.warn(`⚠️ Error verificando modelo, descargando por seguridad:`, error);
      return true;
    }
  }

  async downloadModel(modelInfo) {
    try {
      const modelKey = `${modelInfo.category}_${modelInfo.model_name}`;
      
      // Evitar descargas duplicadas
      if (this.downloadPromises.has(modelKey)) {
        console.log(`⏳ Descarga ya en progreso para ${modelKey}`);
        return await this.downloadPromises.get(modelKey);
      }

      const downloadPromise = this._performDownload(modelInfo, modelKey);
      this.downloadPromises.set(modelKey, downloadPromise);

      try {
        const result = await downloadPromise;
        return result;
      } finally {
        this.downloadPromises.delete(modelKey);
      }

    } catch (error) {
      console.error(`❌ Error descargando modelo:`, error);
      return { success: false, error: error.message };
    }
  }

  async _performDownload(modelInfo, modelKey) {
    try {
      console.log(`📥 Iniciando descarga de ${modelKey}...`);

      const { model_url, weights_url } = modelInfo.download_info;
      
      if (!model_url || !weights_url) {
        throw new Error('URLs de descarga no disponibles');
      }

      // 🚨 CONSTRUIR URLs COMPLETAS PARA RENDER
      const fullModelUrl = `${this.API_BASE_URL}${model_url}`;
      const fullWeightsUrl = `${this.API_BASE_URL}${weights_url}`;

      console.log(`📡 Descargando desde: ${fullModelUrl}`);

      // 🆕 DESCARGAR CON RETRY PARA RENDER
      const modelResponse = await this.fetchWithRetry(fullModelUrl);
      const weightsResponse = await this.fetchWithRetry(fullWeightsUrl);

      // Verificar que ambas descargas fueron exitosas
      if (!modelResponse.ok || !weightsResponse.ok) {
        throw new Error('Error descargando archivos del modelo');
      }

      // 🆕 CREAR MODELO USANDO TENSORFLOW.JS con URLs de Render
      console.log(`🧠 Cargando modelo con TensorFlow.js...`);
      
      const loadedModel = await tf.loadLayersModel(fullModelUrl);

      if (!loadedModel) {
        throw new Error('No se pudo cargar el modelo con TensorFlow.js');
      }

      // Guardar en IndexedDB
      const indexedDBKey = `indexeddb://${modelKey}`;
      await loadedModel.save(indexedDBKey);

      console.log(`💾 Modelo guardado en IndexedDB: ${indexedDBKey}`);

      // Guardar metadata en localStorage
      localStorage.setItem(`${modelKey}_version`, modelInfo.training_date);
      localStorage.setItem(`${modelKey}_timestamp`, new Date().toISOString());
      localStorage.setItem(`${modelKey}_labels`, JSON.stringify(modelInfo.labels));
      localStorage.setItem(`${modelKey}_accuracy`, modelInfo.accuracy.toString());
      localStorage.setItem(`${modelKey}_info`, JSON.stringify(modelInfo));

      // Cachear en memoria
      this.modelCache.set(modelKey, {
        model: loadedModel,
        labels: modelInfo.labels,
        info: modelInfo
      });

      this.downloadedModels.set(modelKey, modelInfo);

      console.log(`✅ Modelo ${modelKey} descargado y guardado exitosamente`);

      return { 
        success: true, 
        modelKey,
        model: loadedModel,
        info: modelInfo
      };

    } catch (error) {
      console.error(`❌ Error en descarga de ${modelKey}:`, error);
      
      // 🆕 ERRORES ESPECÍFICOS DE RENDER
      if (error.name === 'AbortError') {
        return { success: false, error: 'Timeout descargando modelo (Render puede estar lento)' };
      }
      
      if (error.message.includes('404')) {
        return { success: false, error: 'Modelo no encontrado en el servidor' };
      }
      
      return { success: false, error: error.message };
    }
  }

  // ========== CARGA DE MODELOS ==========

  async loadModel(category, modelName) {
    try {
      const modelKey = `${category}_${modelName}`;
      
      console.log(`🔄 Cargando modelo: ${modelKey}`);

      // Verificar cache en memoria primero
      if (this.modelCache.has(modelKey)) {
        console.log(`⚡ Modelo encontrado en cache de memoria`);
        return this.modelCache.get(modelKey);
      }

      // Cargar desde IndexedDB
      const indexedDBKey = `indexeddb://${modelKey}`;
      
      console.log(`📁 Intentando cargar desde IndexedDB: ${indexedDBKey}`);
      
      const loadedModel = await tf.loadLayersModel(indexedDBKey);

      if (!loadedModel) {
        throw new Error(`No se pudo cargar el modelo ${modelKey} desde IndexedDB`);
      }

      // Obtener metadata
      const labelsStr = localStorage.getItem(`${modelKey}_labels`);
      const infoStr = localStorage.getItem(`${modelKey}_info`);
      
      const labels = labelsStr ? JSON.parse(labelsStr) : [];
      const info = infoStr ? JSON.parse(infoStr) : {};

      // Cachear en memoria
      const cachedData = {
        model: loadedModel,
        labels: labels,
        info: info
      };

      this.modelCache.set(modelKey, cachedData);

      console.log(`✅ Modelo ${modelKey} cargado exitosamente`);

      return cachedData;

    } catch (error) {
      console.error(`❌ Error cargando modelo ${category}/${modelName}:`, error);
      throw error;
    }
  }

  async predict(category, modelName, landmarks) {
    try {
      const { model } = await this.loadModel(category, modelName);
      
      // Validar landmarks
      if (!landmarks || landmarks.length !== 126) {
        throw new Error(`Landmarks inválidos: esperados 126, recibidos ${landmarks?.length || 0}`);
      }

      // Convertir a tensor
      const inputTensor = tf.tensor2d([landmarks], [1, 126], 'float32');
      
      // Hacer predicción
      const prediction = model.predict(inputTensor);
      const predictionArray = await prediction.data();
      
      // Limpiar tensores
      tf.dispose([inputTensor, prediction]);
      
      return Array.from(predictionArray);

    } catch (error) {
      console.error(`❌ Error en predicción:`, error);
      throw error;
    }
  }

  // ========== UTILIDADES MEJORADAS ==========

  async modelExistsInIndexedDB(modelKey) {
    try {
      const indexedDBKey = `indexeddb://${modelKey}`;
      await tf.loadLayersModel(indexedDBKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  getDownloadedModels(category = null) {
    if (!category) {
      return Array.from(this.downloadedModels.values());
    }
    
    return Array.from(this.downloadedModels.values())
      .filter(model => model.category === category);
  }

  async clearCache() {
    try {
      console.log('🧹 Limpiando cache de modelos...');
      
      // Limpiar cache en memoria
      this.modelCache.forEach(({ model }) => {
        try {
          tf.dispose(model);
        } catch (error) {
          console.warn('Error limpiando modelo de memoria:', error);
        }
      });
      
      this.modelCache.clear();
      this.downloadedModels.clear();

      // Limpiar localStorage
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('_version') || key.includes('_timestamp') || 
                   key.includes('_labels') || key.includes('_accuracy') || 
                   key.includes('_info'))) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));

      console.log(`✅ Cache limpiado: ${keysToRemove.length} entradas removidas`);
      
      return { success: true, removedEntries: keysToRemove.length };

    } catch (error) {
      console.error('❌ Error limpiando cache:', error);
      return { success: false, error: error.message };
    }
  }

  // 🆕 MÉTODO PARA DIAGNOSTICAR PROBLEMAS CON RENDER
  async diagnoseConnection() {
    console.log('🔍 Diagnóstico de conexión con Render...');
    
    const results = {
      apiUrl: this.API_BASE_URL,
      timestamp: new Date().toISOString(),
      tests: {}
    };

    try {
      // Test 1: Conectividad básica
      console.log('Test 1: Conectividad básica...');
      const healthResponse = await this.fetchWithRetry(`${this.API_BASE_URL}/health`);
      results.tests.health = { 
        success: true, 
        data: await healthResponse.json(),
        responseTime: 'OK'
      };
      console.log('✅ Test 1 pasado');
    } catch (error) {
      results.tests.health = { success: false, error: error.message };
      console.log('❌ Test 1 falló:', error.message);
    }

    try {
      // Test 2: CORS
      console.log('Test 2: CORS...');
      const corsResponse = await this.fetchWithRetry(`${this.API_BASE_URL}/cors-test`);
      results.tests.cors = { 
        success: true, 
        data: await corsResponse.json() 
      };
      console.log('✅ Test 2 pasado');
    } catch (error) {
      results.tests.cors = { success: false, error: error.message };
      console.log('❌ Test 2 falló:', error.message);
    }

    try {
      // Test 3: Modelos disponibles
      console.log('Test 3: Modelos disponibles...');
      const modelsResponse = await this.fetchWithRetry(`${this.API_BASE_URL}/train/models/available`);
      const modelsData = await modelsResponse.json();
      results.tests.models = { 
        success: true, 
        count: modelsData.total || 0,
        data: modelsData 
      };
      console.log('✅ Test 3 pasado');
    } catch (error) {
      results.tests.models = { success: false, error: error.message };
      console.log('❌ Test 3 falló:', error.message);
    }

    console.log('📊 Diagnóstico completo:', results);
    return results;
  }

  getStatus() {
    return {
      downloadedModels: this.downloadedModels.size,
      cachedModels: this.modelCache.size,
      memoryStats: tf.memory(),
      apiUrl: this.API_BASE_URL,
      timeout: this.timeout,
      retryAttempts: this.retryAttempts
    };
  }

  // 🆕 MÉTODOS ADICIONALES ÚTILES

  async getDownloadedModelInfo(category, modelName) {
    try {
      const modelKey = `${category}_${modelName}`;
      const infoStr = localStorage.getItem(`${modelKey}_info`);
      
      if (!infoStr) {
        throw new Error(`No se encontró información del modelo ${modelKey}`);
      }
      
      return JSON.parse(infoStr);
    } catch (error) {
      console.error('Error obteniendo información del modelo:', error);
      return null;
    }
  }

  async getModelStatus(category, modelName) {
    const modelKey = `${category}_${modelName}`;
    
    try {
      const status = {
        modelKey,
        category,
        modelName,
        existsInMemory: this.modelCache.has(modelKey),
        existsInLocalStorage: !!localStorage.getItem(`${modelKey}_info`),
        existsInIndexedDB: await this.modelExistsInIndexedDB(modelKey),
        info: null,
        error: null
      };

      // Obtener información si existe
      if (status.existsInLocalStorage) {
        try {
          status.info = JSON.parse(localStorage.getItem(`${modelKey}_info`));
        } catch (error) {
          status.error = `Error parseando info: ${error.message}`;
        }
      }

      // Estado general
      status.ready = status.existsInIndexedDB && status.existsInLocalStorage;
      status.needsDownload = !status.ready;

      return status;
    } catch (error) {
      return {
        modelKey,
        category, 
        modelName,
        error: error.message,
        ready: false,
        needsDownload: true
      };
    }
  }

  async clearSpecificModel(category, modelName) {
    try {
      const modelKey = `${category}_${modelName}`;
      
      console.log(`🧹 Limpiando modelo específico: ${modelKey}`);

      // Limpiar de memoria
      if (this.modelCache.has(modelKey)) {
        const cached = this.modelCache.get(modelKey);
        if (cached.model) {
          tf.dispose(cached.model);
        }
        this.modelCache.delete(modelKey);
        console.log(`  ✅ Removido de memoria`);
      }

      // Limpiar de localStorage
      const keysToRemove = [
        `${modelKey}_version`,
        `${modelKey}_timestamp`,
        `${modelKey}_labels`,
        `${modelKey}_accuracy`,
        `${modelKey}_info`
      ];

      keysToRemove.forEach(key => {
        if (localStorage.getItem(key)) {
          localStorage.removeItem(key);
        }
      });
      console.log(`  ✅ Removido de localStorage`);

      // Limpiar de IndexedDB
      try {
        const indexedDBKey = `indexeddb://${modelKey}`;
        await tf.io.removeModel(indexedDBKey);
        console.log(`  ✅ Removido de IndexedDB`);
      } catch (error) {
        console.warn(`  ⚠️ No se pudo remover de IndexedDB: ${error.message}`);
      }

      // Limpiar de maps internos
      this.downloadedModels.delete(modelKey);
      this.downloadPromises.delete(modelKey);

      console.log(`✅ Modelo ${modelKey} limpiado completamente`);
      
      return { success: true, modelKey };

    } catch (error) {
      console.error(`❌ Error limpiando modelo ${category}/${modelName}:`, error);
      return { success: false, error: error.message };
    }
  }

  async forceDownloadModel(category, modelName) {
    try {
      console.log(`🔄 Forzando descarga de ${category}/${modelName}...`);
      
      const modelKey = `${category}_${modelName}`;
      
      // Limpiar cache existente
      await this.clearSpecificModel(category, modelName);
      
      // Obtener información del modelo desde el backend
      const modelsInfo = await this.getAvailableModels();
      const modelInfo = modelsInfo.find(m => m.category === category && m.model_name === modelName);
      
      if (!modelInfo) {
        throw new Error(`Modelo ${category}/${modelName} no encontrado en el backend`);
      }
      
      // Descargar
      const result = await this.downloadModel(modelInfo);
      
      if (result.success) {
        console.log(`✅ Descarga forzada exitosa para ${modelKey}`);
      } else {
        console.log(`❌ Descarga forzada falló para ${modelKey}:`, result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error en descarga forzada:`, error);
      return { success: false, error: error.message };
    }
  }
  async loadPersistedModels() {
  console.log('🔄 Cargando modelos persistidos...');
  
  const persistedModels = [];
  
  // Buscar en localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.endsWith('_info')) {
      try {
        const modelKey = key.replace('_info', '');
        const infoStr = localStorage.getItem(key);
        const info = JSON.parse(infoStr);
        
        // Verificar que el modelo existe en IndexedDB
        const exists = await this.modelExistsInIndexedDB(modelKey);
        if (exists) {
          this.downloadedModels.set(modelKey, info);
          persistedModels.push(info);
          console.log(`✅ Modelo recuperado: ${modelKey}`);
        }
      } catch (error) {
        console.warn(`⚠️ Error recuperando modelo ${key}:`, error);
      }
    }
  }
  
  console.log(`📦 ${persistedModels.length} modelos persistidos recuperados`);
  return persistedModels;
}
}

// Exportar instancia única
const modelDownloadService = new ModelDownloadService();

// 🆕 TEST INICIAL PARA RENDER - Con mejor manejo de errores
modelDownloadService.diagnoseConnection()
  .then(results => {
    const healthPassed = results.tests.health?.success;
    const corsPassed = results.tests.cors?.success;
    const modelsPassed = results.tests.models?.success;
    
    if (healthPassed && corsPassed) {
      console.log('🎉 ModelDownloadService: Conexión con Render exitosa');
      if (modelsPassed) {
        console.log(`📦 ${results.tests.models.count} modelos disponibles en backend`);
      } else {
        console.log('ℹ️ Backend conectado pero sin modelos disponibles');
      }
    } else {
      console.warn('⚠️ ModelDownloadService: Problemas de conexión con Render:', {
        health: healthPassed ? '✅' : '❌',
        cors: corsPassed ? '✅' : '❌', 
        models: modelsPassed ? '✅' : '❌'
      });
      
      // Sugerencias específicas
      if (!healthPassed) {
        console.warn('💡 Sugerencia: Verifica que el backend esté ejecutándose en Render');
      }
      if (!corsPassed) {
        console.warn('💡 Sugerencia: Actualiza la configuración CORS en main.py');
      }
    }
  })
  .catch(error => {
    console.warn('⚠️ Error en diagnóstico inicial de ModelDownloadService:', error.message);
    
    if (error.message.includes('fetch')) {
      console.warn('💡 Posible causa: El backend en Render puede estar durmiendo o no disponible');
    }
  });

// 🆕 EXPORTAR TAMBIÉN MÉTODOS ÚTILES PARA DEBUGGING
export const modelDownloadServiceDebug = {
  async testConnection() {
    return await modelDownloadService.diagnoseConnection();
  },
  
  async forceDownload(category, modelName) {
    return await modelDownloadService.forceDownloadModel(category, modelName);
  },
  
  async getStatus() {
    return modelDownloadService.getStatus();
  },
  
  async clearAll() {
    return await modelDownloadService.clearCache();
  },
  
  async clearModel(category, modelName) {
    return await modelDownloadService.clearSpecificModel(category, modelName);
  },

  async getModelInfo(category, modelName) {
    return await modelDownloadService.getDownloadedModelInfo(category, modelName);
  },

  async checkModel(category, modelName) {
    return await modelDownloadService.getModelStatus(category, modelName);
  }
  
};

export default modelDownloadService;