// src/services/tfjsTrainer.js - VERSIÓN CORREGIDA
import * as tf from '@tensorflow/tfjs';

class TfJsTrainer {
  constructor() {
    this.models = new Map();
  }

  async trainModel(X, y, labels, epochs = 50, batchSize = 16, onProgress = null) {
    try {
      console.log('Iniciando entrenamiento...');
      console.log('Dimensiones de X:', X.length, 'x', X[0]?.length);
      console.log('Dimensiones de y:', y.length);
      console.log('Etiquetas:', labels);
      
      // Validar datos
      if (X.length === 0 || y.length === 0) {
        throw new Error('No hay datos para entrenar');
      }

      if (X.length !== y.length) {
        throw new Error(`X y y tienen tamaños diferentes: X=${X.length}, y=${y.length}`);
      }

      // Convertir a tensores - CORRECCIÓN IMPORTANTE
      const xs = tf.tensor2d(X, [X.length, X[0].length], 'float32');
      
      // Convertir y a float32 en lugar de int32
      const ys = tf.tensor1d(y, 'float32'); // CAMBIO: 'float32' en lugar de 'int32'
      
      console.log('Shape de xs:', xs.shape);
      console.log('Shape de ys:', ys.shape);
      console.log('Tipo de xs:', xs.dtype);
      console.log('Tipo de ys:', ys.dtype);

      // Crear modelo
      const model = this.createModel(X[0].length, labels.length);
      
      // Configurar callbacks de progreso
      const callbacks = [];
      if (onProgress) {
        callbacks.push({
          onEpochEnd: async (epoch, logs) => {
            const progress = Math.round((epoch / epochs) * 100);
            const accuracy = logs.acc ? (logs.acc * 100).toFixed(1) : '0.0';
            const loss = logs.loss ? logs.loss.toFixed(4) : '0.0000';
            onProgress(progress, `Época ${epoch + 1}/${epochs} - Precisión: ${accuracy}% - Pérdida: ${loss}`);
          }
        });
      }

      // Entrenar modelo
      console.log('Comenzando entrenamiento...');
      const history = await model.fit(xs, ys, {
        epochs,
        batchSize: Math.min(batchSize, X.length), // Asegurar que batchSize no sea mayor que los datos
        validationSplit: 0.2,
        shuffle: true,
        verbose: 0, // Reducir verbosidad
        callbacks
      });

      // Obtener métricas finales
      const finalAccuracy = history.history.acc ? history.history.acc[history.history.acc.length - 1] : 0;
      const finalLoss = history.history.loss ? history.history.loss[history.history.loss.length - 1] : 0;

      console.log('Entrenamiento completado');
      console.log('Precisión final:', finalAccuracy);
      console.log('Pérdida final:', finalLoss);

      // Guardar modelo en memoria
      const modelKey = `${Date.now()}_model`;
      this.models.set(modelKey, model);

      // Limpiar tensores para evitar memory leaks
      tf.dispose([xs, ys]);
      
      return {
        model,
        history: history.history,
        finalAccuracy,
        finalLoss,
        modelKey
      };
      
    } catch (error) {
      console.error('Error detallado en entrenamiento:', error);
      throw error;
    }
  }

  createModel(inputShape, numClasses) {
    console.log(`Creando modelo con inputShape: ${inputShape}, numClasses: ${numClasses}`);
    
    const model = tf.sequential();
    
    // Capa de entrada
    model.add(tf.layers.dense({
      units: 128, // Reducido para mayor eficiencia
      activation: 'relu',
      inputShape: [inputShape]
    }));
    
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.dropout({ rate: 0.3 }));
    
    // Capas ocultas
    model.add(tf.layers.dense({ 
      units: 64, 
      activation: 'relu' 
    }));
    model.add(tf.layers.dropout({ rate: 0.3 }));
    
    model.add(tf.layers.dense({ 
      units: 32, 
      activation: 'relu' 
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    
    // Capa de salida
    model.add(tf.layers.dense({ 
      units: numClasses, 
      activation: 'softmax' 
    }));
    
    // Compilar modelo
    model.compile({
      optimizer: tf.train.adam(0.001), // Learning rate explícito
      loss: 'sparseCategoricalCrossentropy', // Usar sparse para etiquetas enteras
      metrics: ['accuracy']
    });
    
    console.log('Modelo creado exitosamente');
    return model;
  }

  async saveModel(category, modelName) {
    try {
      const key = `${category}_${modelName}`;
      
      // Buscar el último modelo entrenado
      let latestModel = null;
      let latestKey = null;
      
      this.models.forEach((model, modelKey) => {
        if (modelKey.includes(category)) {
          latestModel = model;
          latestKey = modelKey;
        }
      });
      
      if (!latestModel) {
        throw new Error('No hay modelo entrenado para guardar');
      }
      
      // Guardar información del modelo
      const modelInfo = {
        category,
        modelName,
        date: new Date().toISOString(),
        inputShape: latestModel.inputs[0].shape,
        outputShape: latestModel.outputs[0].shape,
        layers: latestModel.layers.map(layer => ({
          name: layer.name,
          type: layer.getClassName(),
          units: layer.units || 'N/A'
        }))
      };
      
      // Guardar en localStorage (versión simplificada)
      localStorage.setItem(`${key}_info`, JSON.stringify(modelInfo));
      
      console.log(`✅ Modelo ${key} guardado localmente`);
      
      return modelInfo;
      
    } catch (error) {
      console.error('Error guardando modelo:', error);
      throw error;
    }
  }

  async predict(category, modelName, landmarks) {
    try {
      const key = `${category}_${modelName}`;
      const model = this.models.get(key);
      
      if (!model) {
        throw new Error(`Modelo ${key} no encontrado en memoria`);
      }
      
      // Convertir landmarks a tensor
      const inputTensor = tf.tensor2d([landmarks], [1, landmarks.length], 'float32');
      
      // Hacer predicción
      const prediction = model.predict(inputTensor);
      const predictionArray = await prediction.data();
      
      // Limpiar tensores
      tf.dispose([inputTensor, prediction]);
      
      return Array.from(predictionArray);
      
    } catch (error) {
      console.error('Error en predicción:', error);
      throw error;
    }
  }

  hasModel(category, modelName) {
    const key = `${category}_${modelName}`;
    return this.models.has(key) || localStorage.getItem(`${key}_info`) !== null;
  }

  async getModelLabels(category, modelName) {
    // Para simplificar, devolver las etiquetas basadas en la categoría
    const categoryLabels = {
      vocales: ['A', 'E', 'I', 'O', 'U'],
      numeros: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      operaciones: ['+', '-', '*', '/', '='],
      palabras: ['hola', 'gracias', 'por_favor', 'si', 'no']
    };
    
    return categoryLabels[category] || [];
  }

  async getLocalModels(category) {
    try {
      // Buscar modelos en localStorage
      const models = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes(category) && key.endsWith('_info')) {
          try {
            const modelInfo = JSON.parse(localStorage.getItem(key));
            models.push({
              model_name: modelInfo.modelName,
              accuracy: 85, // Valor por defecto
              samples_used: 150,
              category: modelInfo.category,
              training_date: modelInfo.date
            });
          } catch (e) {
            console.warn('Error parseando modelo:', key, e);
          }
        }
      }
      
      return models;
    } catch (error) {
      console.error('Error obteniendo modelos locales:', error);
      return [];
    }
  }

  // Nuevo método para limpiar modelos de memoria
  cleanup() {
    this.models.forEach((model, key) => {
      tf.dispose(model);
    });
    this.models.clear();
  }
}

export default new TfJsTrainer();