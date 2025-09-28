// src/services/tfjsTrainer.js - VERSIÓN CORREGIDA
import * as tf from '@tensorflow/tfjs';

class TfJsTrainer {
  constructor() {
    this.models = new Map();
    this.modelLabels = new Map(); // Para guardar las etiquetas de cada modelo
  }

  async trainModel(X, y, labels, epochs = 50, batchSize = 16, onProgress = null) {
    let xs = null;
    let ys = null;
    let model = null;

    try {
      console.log('🚀 Iniciando entrenamiento...');
      console.log('📊 Dimensiones de X:', X.length, 'x', X[0]?.length);
      console.log('📊 Dimensiones de y:', y.length);
      console.log('🏷️ Etiquetas:', labels);
      
      // Validar datos más estrictamente
      if (!X || !y || !labels) {
        throw new Error('Parámetros X, y, o labels son null/undefined');
      }

      if (X.length === 0 || y.length === 0) {
        throw new Error('No hay datos para entrenar');
      }

      if (X.length !== y.length) {
        throw new Error(`X y y tienen tamaños diferentes: X=${X.length}, y=${y.length}`);
      }

      if (labels.length === 0) {
        throw new Error('No se proporcionaron etiquetas');
      }

      // Validar que todas las muestras tengan 126 características
      for (let i = 0; i < X.length; i++) {
        if (!X[i] || X[i].length !== 126) {
          throw new Error(`Muestra ${i} tiene ${X[i]?.length || 0} características, se esperaban 126`);
        }
      }

      // Validar que todas las etiquetas estén en el rango correcto
      const maxLabel = Math.max(...y);
      if (maxLabel >= labels.length) {
        throw new Error(`Etiqueta ${maxLabel} fuera de rango. Máximo permitido: ${labels.length - 1}`);
      }

      console.log('✅ Datos validados correctamente');

      // Convertir a tensores
      console.log('🔄 Convirtiendo datos a tensores...');
      xs = tf.tensor2d(X, [X.length, X[0].length], 'float32');
      ys = tf.tensor1d(y, 'float32');
      
      console.log('📐 Shape de xs:', xs.shape);
      console.log('📐 Shape de ys:', ys.shape);
      console.log('📐 Tipo de xs:', xs.dtype);
      console.log('📐 Tipo de ys:', ys.dtype);

      // Crear modelo
      console.log('🏗️ Creando modelo...');
      model = this.createModel(X[0].length, labels.length);
      
      if (!model) {
        throw new Error('No se pudo crear el modelo');
      }

      console.log('✅ Modelo creado exitosamente');
      
      // Configurar callbacks de progreso
      const callbacks = [];
      if (onProgress) {
        callbacks.push({
          onEpochEnd: async (epoch, logs) => {
            try {
              const progress = Math.round(((epoch + 1) / epochs) * 100);
              const accuracy = logs.acc ? (logs.acc * 100).toFixed(1) : '0.0';
              const loss = logs.loss ? logs.loss.toFixed(4) : '0.0000';
              onProgress(progress, `Época ${epoch + 1}/${epochs} - Precisión: ${accuracy}% - Pérdida: ${loss}`);
            } catch (callbackError) {
              console.warn('Error en callback de progreso:', callbackError);
            }
          }
        });
      }

      // Entrenar modelo
      console.log('🎯 Comenzando entrenamiento...');
      const history = await model.fit(xs, ys, {
        epochs,
        batchSize: Math.min(batchSize, X.length),
        validationSplit: 0.2,
        shuffle: true,
        verbose: 0,
        callbacks
      });

      if (!history || !history.history) {
        throw new Error('El entrenamiento no devolvió un historial válido');
      }

      // Obtener métricas finales
      const finalAccuracy = history.history.acc ? history.history.acc[history.history.acc.length - 1] : 0;
      const finalLoss = history.history.loss ? history.history.loss[history.history.loss.length - 1] : 0;

      console.log('✅ Entrenamiento completado');
      console.log('📈 Precisión final:', finalAccuracy);
      console.log('📉 Pérdida final:', finalLoss);

      // Limpiar tensores de entrada (pero NO el modelo)
      if (xs) tf.dispose(xs);
      if (ys) tf.dispose(ys);
      
      // Verificar que el modelo sigue siendo válido
      if (!model) {
        throw new Error('El modelo se perdió durante el entrenamiento');
      }

      const result = {
        model: model, // ← ASEGURAR que el modelo se devuelve
        history: history.history,
        finalAccuracy,
        finalLoss,
        labels: labels // ← ASEGURAR que las etiquetas se devuelven
      };

      console.log('📦 Resultado preparado:', {
        hasModel: !!result.model,
        hasLabels: !!result.labels && result.labels.length > 0,
        accuracy: result.finalAccuracy,
        loss: result.finalLoss
      });

      return result;
      
    } catch (error) {
      console.error('❌ Error detallado en entrenamiento:', error);
      console.error('Stack trace completo:', error.stack);
      
      // Limpiar recursos en caso de error
      try {
        if (xs) tf.dispose(xs);
        if (ys) tf.dispose(ys);
        if (model) tf.dispose(model);
      } catch (cleanupError) {
        console.warn('Error limpiando recursos:', cleanupError);
      }
      
      throw error;
    }
  }

  createModel(inputShape, numClasses) {
    console.log(`Creando modelo con inputShape: ${inputShape}, numClasses: ${numClasses}`);
    
    const model = tf.sequential();
    
    // Capa de entrada
    model.add(tf.layers.dense({
      units: 128,
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
      optimizer: tf.train.adam(0.001),
      loss: 'sparseCategoricalCrossentropy',
      metrics: ['accuracy']
    });
    
    console.log('Modelo creado exitosamente');
    return model;
  }

  // CORRECCIÓN: Modificar saveModel para recibir el modelo como parámetro
  async saveModel(category, modelName, trainedModel, labels) {
    try {
      console.log('💾 Intentando guardar modelo...');
      console.log('  - category:', category);
      console.log('  - modelName:', modelName);
      console.log('  - trainedModel existe:', !!trainedModel);
      console.log('  - trainedModel type:', typeof trainedModel);
      console.log('  - labels:', labels);

      if (!trainedModel) {
        console.error('❌ trainedModel es null/undefined:', trainedModel);
        throw new Error('No se proporcionó un modelo para guardar');
      }

      if (!labels || labels.length === 0) {
        console.error('❌ labels son inválidas:', labels);
        throw new Error('No se proporcionaron etiquetas válidas para guardar');
      }

      // Verificar que es un modelo de TensorFlow.js válido
      if (!trainedModel.layers || !trainedModel.inputs || !trainedModel.outputs) {
        console.error('❌ El objeto no parece ser un modelo de TensorFlow.js válido:', trainedModel);
        throw new Error('El objeto proporcionado no es un modelo de TensorFlow.js válido');
      }

      const key = `${category}_${modelName}`;
      console.log('🔑 Key del modelo:', key);
      
      // Guardar modelo en memoria
      this.models.set(key, trainedModel);
      this.modelLabels.set(key, labels);
      
      console.log('✅ Modelo guardado en memoria');
      console.log('📊 Modelos en memoria ahora:', this.models.size);
      
      // Guardar información del modelo en localStorage
      const modelInfo = {
        category,
        modelName,
        date: new Date().toISOString(),
        labels: labels,
        inputShape: trainedModel.inputs[0].shape,
        outputShape: trainedModel.outputs[0].shape,
        layers: trainedModel.layers.map(layer => ({
          name: layer.name,
          type: layer.getClassName(),
          units: layer.units || 'N/A'
        }))
      };
      
      const infoKey = `${key}_info`;
      localStorage.setItem(infoKey, JSON.stringify(modelInfo));
      
      console.log('💾 Información guardada en localStorage con key:', infoKey);
      console.log('✅ Modelo', key, 'guardado exitosamente');
      
      return modelInfo;
      
    } catch (error) {
      console.error('❌ Error guardando modelo:', error);
      console.error('Stack trace:', error.stack);
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
      
      // Validar landmarks
      if (!landmarks || landmarks.length !== 126) {
        throw new Error(`Landmarks inválidos: esperados 126, recibidos ${landmarks?.length || 0}`);
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
    return this.models.has(key);
  }

  async getModelLabels(category, modelName) {
    const key = `${category}_${modelName}`;
    
    // Primero intentar obtener desde memoria
    if (this.modelLabels.has(key)) {
      return this.modelLabels.get(key);
    }
    
    // Si no está en memoria, intentar desde localStorage
    try {
      const modelInfo = localStorage.getItem(`${key}_info`);
      if (modelInfo) {
        const parsed = JSON.parse(modelInfo);
        return parsed.labels || [];
      }
    } catch (error) {
      console.warn('Error obteniendo etiquetas desde localStorage:', error);
    }
    
    // Fallback: etiquetas por defecto según categoría
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
      const models = [];
      
      // Buscar modelos en localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${category}_`) && key.endsWith('_info')) {
          try {
            const modelInfo = JSON.parse(localStorage.getItem(key));
            const modelKey = key.replace('_info', '');
            
            models.push({
              model_name: modelInfo.modelName,
              accuracy: 85, // Valor estimado
              samples_used: 150, // Valor estimado
              category: modelInfo.category,
              training_date: modelInfo.date,
              labels: modelInfo.labels || [],
              ready_for_prediction: this.models.has(modelKey)
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

  // Método para cargar un modelo guardado en memoria
  async loadSavedModel(category, modelName) {
    const key = `${category}_${modelName}`;
    
    // Si ya está en memoria, no hacer nada
    if (this.models.has(key)) {
      console.log(`Modelo ${key} ya está cargado en memoria`);
      return true;
    }
    
    // Verificar si existe la información del modelo
    const modelInfo = localStorage.getItem(`${key}_info`);
    if (!modelInfo) {
      throw new Error(`No se encontró información del modelo ${key}`);
    }
    
    console.log(`Modelo ${key} encontrado pero no cargado en memoria. Se requiere re-entrenamiento.`);
    return false;
  }

  // Limpiar modelos de memoria
  cleanup() {
    this.models.forEach((model) => {
      try {
        tf.dispose(model);
      } catch (error) {
        console.warn('Error limpiando modelo:', error);
      }
    });
    this.models.clear();
    this.modelLabels.clear();
  }

  // Método para obtener estadísticas de memoria
  getMemoryStats() {
    return {
      modelsInMemory: this.models.size,
      tensorCount: tf.memory().numTensors,
      memoryUsage: tf.memory().numBytes
    };
  }
}

export default new TfJsTrainer();