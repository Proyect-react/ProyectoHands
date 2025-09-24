// src/services/apiService.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

class APIService {
  // Recolección de datos
  async collectSample(category, label, landmarks, metadata = {}) {
    try {
      const response = await fetch(`${API_BASE_URL}/collect/sample/landmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          label,
          landmarks,
          timestamp: new Date().toISOString(),
          metadata
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Error enviando muestra:', error);
      throw error;
    }
  }

  // Obtener estado del dataset
  async getDatasetStatus(category) {
    try {
      const response = await fetch(`${API_BASE_URL}/collect/dataset/${category}/summary`);
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo estado:', error);
      throw error;
    }
  }

  // Iniciar entrenamiento
  async startTraining(category) {
    try {
      const response = await fetch(`${API_BASE_URL}/train/${category}/advanced`, {
        method: 'POST',
      });
      return await response.json();
    } catch (error) {
      console.error('Error iniciando entrenamiento:', error);
      throw error;
    }
  }

  // Verificar progreso de entrenamiento
  async getTrainingProgress(category) {
    try {
      const response = await fetch(`${API_BASE_URL}/train/progress/${category}`);
      return await response.json();
    } catch (error) {
      console.error('Error verificando progreso:', error);
      throw error;
    }
  }

  // Hacer predicción
  async predict(category, landmarks, options = {}) {
    try {
      const response = await fetch(`${API_BASE_URL}/predict/${category}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          landmarks,
          confidence_threshold: options.threshold || 0.7,
          return_all_probabilities: options.returnAll || false
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Error en predicción:', error);
      throw error;
    }
  }

  // Obtener modelos disponibles
  async getAvailableModels() {
    try {
      const response = await fetch(`${API_BASE_URL}/predict/available`);
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo modelos:', error);
      throw error;
    }
  }

  // Obtener información detallada del modelo
  async getModelInfo(category) {
    try {
      const response = await fetch(`${API_BASE_URL}/predict/${category}/model-info`);
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo info del modelo:', error);
      throw error;
    }
  }
}

export default new APIService();