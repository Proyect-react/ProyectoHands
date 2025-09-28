// src/services/modelDownloadService.js - VERSIÓN COMPLETA
import * as tf from '@tensorflow/tfjs';

class ModelDownloadService {
  constructor() {
    this.API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';
    this.downloadedModels = new Map();
    this.modelCache = new Map(); // Cache en memoria
    this.downloadPromises = new Map(); // Evitar descargas duplicadas
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
      const response = await fetch(`${this.API_BASE_URL}/train/models/available`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('ℹ️ Backend no tiene modelos disponibles');
          return [];
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data.models || [];

    } catch (error) {
      console.error('❌ Error obteniendo modelos disponibles:', error);
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

      // Construir URLs completas
      const fullModelUrl = `${this.API_BASE_URL}${model_url}`;
      const fullWeightsUrl = `${this.API_BASE_URL}${weights_url}`;

      console.log(`📡 Descargando desde: ${fullModelUrl}`);

      // Cargar modelo usando TensorFlow.js
      const loadedModel = await tf.loadLayersModel(fullModelUrl);

      if (!loadedModel) {
        throw new Error('No se pudo cargar el modelo');
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

  // ========== UTILIDADES ==========

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

  getStatus() {
    return {
      downloadedModels: this.downloadedModels.size,
      cachedModels: this.modelCache.size,
      memoryStats: tf.memory(),
      apiUrl: this.API_BASE_URL
    };
  }
}

// Exportar instancia única
const modelDownloadService = new ModelDownloadService();
export default modelDownloadService;