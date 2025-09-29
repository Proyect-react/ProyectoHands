import * as tf from '@tensorflow/tfjs';

class ModelDownloadService {
  constructor() {
    this.API_BASE_URL = process.env.REACT_APP_API_URL || 'https://backend-c2aj.onrender.com';
    this.downloadedModels = new Map();
    this.modelCache = new Map();
    this.downloadPromises = new Map();
    this.timeout = 45000;
    this.retryAttempts = 3;

    console.log(`🤖 ModelDownloadService inicializado con URL: ${this.API_BASE_URL}`);
  }

  // 🆕 MÉTODO MEJORADO PARA CREAR CLAVES CONSISTENTES
  createModelKey(category, modelName) {
    // 🚨 CORREGIDO: Usar formato consistente
    return `${category}_${modelName}`.toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  // 🆕 MÉTODO PARA OBTENER METADATA PERSISTIDA
  getPersistedModels() {
    try {
      const stored = localStorage.getItem('downloaded_models');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error obteniendo modelos persistidos:', error);
      return [];
    }
  }

  // 🆕 MÉTODO PARA GUARDAR METADATA PERSISTIDA
  savePersistedModels(models) {
    try {
      localStorage.setItem('downloaded_models', JSON.stringify(models));
    } catch (error) {
      console.error('Error guardando modelos persistidos:', error);
    }
  }

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

      for (const modelInfo of modelsToCheck) {
        try {
          // 🚨 CORREGIDO: Usar createModelKey para consistencia
          const modelKey = this.createModelKey(modelInfo.category, modelInfo.model_name);
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
      const response = await this.fetchWithRetry(`${this.API_BASE_URL}/train/models/available`);
      const data = await response.json();
      console.log(`✅ Respuesta del servidor:`, data);
      return data.models || [];
    } catch (error) {
      console.error('❌ Error obteniendo modelos disponibles:', error);
      if (error.message.includes('404')) {
        console.log('ℹ️ Backend no tiene modelos disponibles (404)');
        return [];
      }
      if (error.name === 'AbortError') {
        throw new Error('Timeout: El backend puede estar iniciándose. Intenta de nuevo en unos segundos.');
      }
      throw error;
    }
  }

  async shouldDownloadModel(modelInfo) {
    try {
      // 🚨 CORREGIDO: Usar createModelKey para consistencia
      const modelKey = this.createModelKey(modelInfo.category, modelInfo.model_name);

      // Verificar en modelos persistidos
      const persistedModels = this.getPersistedModels();
      const existingModel = persistedModels.find(m =>
        m.category === modelInfo.category && m.model_name === modelInfo.model_name
      );

      // Si no existe localmente, descargar
      if (!existingModel) {
        console.log(`📥 Modelo ${modelKey} no existe localmente`);
        return true;
      }

      // Comparar fechas de entrenamiento
      const backendDate = new Date(modelInfo.training_date);
      const localDate = new Date(existingModel.training_date || existingModel.metadata?.saved_at);

      if (backendDate > localDate) {
        console.log(`🔄 Nueva versión disponible para ${modelKey}`);
        return true;
      }

      // Verificar que existe en IndexedDB
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
      // 🚨 CORREGIDO: Usar createModelKey para consistencia
      const modelKey = this.createModelKey(modelInfo.category, modelInfo.model_name);

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

      const fullModelUrl = `${this.API_BASE_URL}${model_url}`;
      const fullWeightsUrl = `${this.API_BASE_URL}${weights_url}`;

      console.log(`📡 Descargando desde: ${fullModelUrl}`);

      // Descargar con retry
      const modelResponse = await this.fetchWithRetry(fullModelUrl);
      const weightsResponse = await this.fetchWithRetry(fullWeightsUrl);

      if (!modelResponse.ok || !weightsResponse.ok) {
        throw new Error('Error descargando archivos del modelo');
      }

      // Cargar modelo
      console.log(`🧠 Cargando modelo con TensorFlow.js...`);
      const loadedModel = await tf.loadLayersModel(fullModelUrl);

      if (!loadedModel) {
        throw new Error('No se pudo cargar el modelo con TensorFlow.js');
      }

      // 🚨 CORREGIDO: Guardar en IndexedDB con clave consistente
      const indexedDBKey = `indexeddb://${modelKey}`;
      await loadedModel.save(indexedDBKey);
      console.log(`💾 Modelo guardado en IndexedDB: ${indexedDBKey}`);

      // 🚨 CORREGIDO: Guardar metadata en estructura persistida
      const modelData = {
        category: modelInfo.category,
        model_name: modelInfo.model_name,
        model_key: modelKey,
        labels: modelInfo.labels,
        accuracy: modelInfo.accuracy,
        training_date: modelInfo.training_date,
        samples_used: modelInfo.samples_used,
        download_info: modelInfo.download_info,
        metadata: {
          saved_at: new Date().toISOString(),
          total_labels: modelInfo.labels.length,
          indexeddb_key: indexedDBKey
        }
      };

      // Actualizar lista de modelos persistidos
      const persistedModels = this.getPersistedModels();
      const existingIndex = persistedModels.findIndex(m =>
        m.model_key === modelKey
      );

      if (existingIndex >= 0) {
        persistedModels[existingIndex] = modelData;
      } else {
        persistedModels.push(modelData);
      }

      this.savePersistedModels(persistedModels);

      // Cachear en memoria
      this.modelCache.set(modelKey, {
        model: loadedModel,
        labels: modelInfo.labels,
        info: modelData
      });

      this.downloadedModels.set(modelKey, modelData);

      console.log(`✅ Modelo ${modelKey} descargado y guardado exitosamente`);

      return {
        success: true,
        modelKey,
        model: loadedModel,
        info: modelData
      };

    } catch (error) {
      console.error(`❌ Error en descarga de ${modelKey}:`, error);

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
      // 🚨 CORREGIDO: Usar createModelKey para consistencia
      const modelKey = this.createModelKey(category, modelName);

      console.log(`🔄 Cargando modelo: ${modelKey}`);

      // Verificar cache en memoria primero
      if (this.modelCache.has(modelKey)) {
        console.log(`⚡ Modelo encontrado en cache de memoria`);
        return this.modelCache.get(modelKey);
      }

      // 🚨 CORREGIDO: Buscar en modelos persistidos
      const persistedModels = this.getPersistedModels();
      const modelData = persistedModels.find(m =>
        m.category === category && m.model_name === modelName
      );

      if (!modelData) {
        throw new Error(`Modelo ${category}/${modelName} no encontrado en almacenamiento local`);
      }

      // Cargar desde IndexedDB
      const indexedDBKey = modelData.metadata?.indexeddb_key || `indexeddb://${modelKey}`;

      console.log(`📁 Intentando cargar desde IndexedDB: ${indexedDBKey}`);

      const loadedModel = await tf.loadLayersModel(indexedDBKey);

      if (!loadedModel) {
        throw new Error(`No se pudo cargar el modelo ${modelKey} desde IndexedDB`);
      }

      // Cachear en memoria
      const cachedData = {
        model: loadedModel,
        labels: modelData.labels,
        info: modelData
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
  // ========== PREDICCIÓN CON MODELO PRE-CARGADO ==========

  async predictWithModel(model, landmarks) {
    try {
      if (!model) {
        throw new Error('Modelo no proporcionado');
      }

      console.log('🎯 Realizando predicción con modelo pre-cargado...');

      // Validar landmarks
      if (!landmarks || landmarks.length !== 126) {
        throw new Error(`Landmarks inválidos: esperados 126, recibidos ${landmarks?.length || 0}`);
      }

      // Convertir landmarks a tensor
      const inputTensor = tf.tensor2d([landmarks], [1, 126], 'float32');

      // Hacer predicción
      const prediction = model.predict(inputTensor);
      const predictionData = await prediction.data();

      // Limpiar tensores
      inputTensor.dispose();
      prediction.dispose();

      const result = Array.from(predictionData);
      console.log(`✅ Predicción completada. Resultados: ${result.length} clases`);

      return result;
    } catch (error) {
      console.error('❌ Error en predictWithModel:', error);
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
    const persistedModels = this.getPersistedModels();

    if (!category) {
      return persistedModels;
    }

    // 🚨 CORREGIDO: Filtrar por categoría exacta
    return persistedModels.filter(model => model.category === category);
  }

  async loadPersistedModels() {
    console.log('🔄 Cargando modelos persistidos...');

    // 🚨 CORREGIDO: Definir la variable primero
    const persistedModels = this.getPersistedModels();

    // Cargar a memoria
    persistedModels.forEach(modelData => {
      const modelKey = modelData.model_key || this.createModelKey(modelData.category, modelData.model_name);
      this.downloadedModels.set(modelKey, modelData);
    });

    console.log(`📦 ${persistedModels.length} modelos persistidos recuperados`);
    return persistedModels;
  }

  // 🆕 MÉTODO PARA VERIFICAR MODELOS POR CATEGORÍA
  async getModelsByCategory(category) {
    const allModels = this.getDownloadedModels();
    const categoryModels = allModels.filter(model => model.category === category);

    console.log(`📊 Modelos para categoría ${category}:`, categoryModels.length);
    return categoryModels;
  }

  // 🆕 MÉTODO PARA VERIFICAR SI UN MODELO EXISTE
  async modelExists(category, modelName) {
    try {
      const modelKey = this.createModelKey(category, modelName);

      // Verificar en persistidos
      const persistedModels = this.getPersistedModels();
      const existsInPersisted = persistedModels.some(m =>
        m.category === category && m.model_name === modelName
      );

      // Verificar en IndexedDB
      const existsInIndexedDB = await this.modelExistsInIndexedDB(modelKey);

      return existsInPersisted && existsInIndexedDB;
    } catch (error) {
      console.error(`Error verificando existencia de modelo ${category}/${modelName}:`, error);
      return false;
    }
  }

  // 🚨 ELIMINAR EL MÉTODO DUPLICADO getPersistedModels() QUE ESTÁ AL FINAL
  // NO agregues otro getPersistedModels() aquí
}

// Exportar instancia única
const modelDownloadService = new ModelDownloadService();

export default modelDownloadService;