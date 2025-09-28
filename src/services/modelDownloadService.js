// src/services/modelDownloadService.js - VERSIÓN CORREGIDA
import * as tf from '@tensorflow/tfjs';

class ModelDownloadService {
  constructor() {
    this.BACKEND_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';
    this.MODEL_CACHE_KEY = 'latest-model';
  }

  async loadLatestModel() {
    try {
      console.log("🔄 Intentando cargar modelo desde cache local...");
      
      // Intentar cargar desde IndexedDB primero
      let model = await tf.loadLayersModel(`indexeddb://${this.MODEL_CACHE_KEY}`);
      console.log("✅ Modelo cargado desde cache local");
      
      // Verificar que el modelo es válido
      if (model && model.inputs && model.outputs) {
        return {
          model: model,
          source: 'cache',
          message: 'Modelo cargado desde cache local'
        };
      } else {
        throw new Error('Modelo en cache no es válido');
      }
      
    } catch (error) {
      console.log("⚠️ No había modelo en cache, descargando del backend...", error.message);
      
      try {
        // Descargar del backend
        const modelUrl = `${this.BACKEND_URL}/train/model/latest/model.json`;
        console.log(`📥 Descargando modelo desde: ${modelUrl}`);
        
        model = await tf.loadLayersModel(modelUrl);
        
        // Verificar que el modelo descargado es válido
        if (!model || !model.inputs || !model.outputs) {
          throw new Error('Modelo descargado no es válido');
        }

        // Guardar en IndexedDB para uso futuro
        console.log("💾 Guardando modelo en cache local...");
        await model.save(`indexeddb://${this.MODEL_CACHE_KEY}`);
        
        console.log("✅ Modelo descargado y guardado localmente");
        
        return {
          model: model,
          source: 'backend',
          message: 'Modelo descargado del backend y guardado en cache'
        };
        
      } catch (downloadError) {
        console.error("❌ Error descargando modelo:", downloadError);
        
        // Verificar si es un error de red o de modelo no encontrado
        if (downloadError.message.includes('404') || downloadError.message.includes('Failed to fetch')) {
          throw new Error('No se pudo conectar al backend o el modelo no está disponible');
        } else {
          throw new Error(`Error descargando modelo: ${downloadError.message}`);
        }
      }
    }
  }

  async checkForUpdates() {
    try {
      console.log("🔍 Verificando actualizaciones del modelo...");
      
      // Verificar si hay nueva versión en el backend
      const response = await fetch(`${this.BACKEND_URL}/train/model/latest/info`);
      
      if (!response.ok) {
        throw new Error(`Backend responded with status: ${response.status}`);
      }
      
      const backendInfo = await response.json();
      
      // Comparar con versión local (guardar metadata en localStorage)
      const localVersion = localStorage.getItem('model_version');
      const localTimestamp = localStorage.getItem('model_timestamp');
      
      console.log(`📊 Versión local: ${localVersion}, Backend: ${backendInfo.version}`);
      
      if (!localVersion || localVersion !== backendInfo.version) {
        console.log("🔄 Nueva versión disponible, actualizando...");
        
        // Descargar nuevo modelo
        const result = await this.loadLatestModel();
        
        // Actualizar metadata local
        localStorage.setItem('model_version', backendInfo.version);
        localStorage.setItem('model_timestamp', new Date().toISOString());
        localStorage.setItem('model_source', result.source);
        
        return {
          updated: true,
          version: backendInfo.version,
          source: result.source,
          message: 'Modelo actualizado exitosamente'
        };
      } else {
        console.log("✅ Modelo está actualizado");
        return {
          updated: false,
          version: localVersion,
          message: 'El modelo ya está actualizado'
        };
      }
      
    } catch (error) {
      console.warn("⚠️ No se pudo verificar actualizaciones:", error.message);
      
      return {
        updated: false,
        error: error.message,
        message: 'No se pudo verificar actualizaciones'
      };
    }
  }

  async getModelInfo() {
    try {
      const version = localStorage.getItem('model_version');
      const timestamp = localStorage.getItem('model_timestamp');
      const source = localStorage.getItem('model_source');
      
      return {
        version: version || 'Desconocida',
        timestamp: timestamp || 'No disponible',
        source: source || 'No disponible',
        cacheKey: this.MODEL_CACHE_KEY,
        backendUrl: this.BACKEND_URL
      };
    } catch (error) {
      console.error('Error obteniendo información del modelo:', error);
      return {
        version: 'Error',
        timestamp: 'Error',
        source: 'Error',
        error: error.message
      };
    }
  }

  async clearCache() {
    try {
      console.log("🧹 Limpiando cache del modelo...");
      
      // Intentar eliminar de IndexedDB
      try {
        // TensorFlow.js no tiene un método directo para eliminar, pero podemos intentar sobreescribir
        await tf.io.removeModel(`indexeddb://${this.MODEL_CACHE_KEY}`);
      } catch (e) {
        console.log("No se pudo eliminar modelo de IndexedDB, puede que no exista");
      }
      
      // Limpiar localStorage
      localStorage.removeItem('model_version');
      localStorage.removeItem('model_timestamp');
      localStorage.removeItem('model_source');
      
      console.log("✅ Cache limpiado exitosamente");
      
      return {
        success: true,
        message: 'Cache del modelo limpiado exitosamente'
      };
      
    } catch (error) {
      console.error('Error limpiando cache:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Método para verificar si hay un modelo disponible localmente
  async hasLocalModel() {
    try {
      await tf.loadLayersModel(`indexeddb://${this.MODEL_CACHE_KEY}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Método para obtener el estado del servicio
  getStatus() {
    const version = localStorage.getItem('model_version');
    const timestamp = localStorage.getItem('model_timestamp');
    
    return {
      hasLocalModel: !!version,
      version: version,
      lastUpdate: timestamp,
      backendUrl: this.BACKEND_URL,
      cacheKey: this.MODEL_CACHE_KEY
    };
  }
}

// Exportar una instancia única (singleton)
const modelDownloadService = new ModelDownloadService();
export default modelDownloadService;