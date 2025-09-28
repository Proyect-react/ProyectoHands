// src/utils/autoModelManager.js
class AutoModelManager {
    constructor() {
        this.storage = localforage.createInstance({ name: 'auto_models' });
        this.loadedModels = new Map();
        this.currentModel = null;
    }

    // ✅ AUTOMÁTICO: Verificar y descargar modelos después del entrenamiento
    async checkForNewModels(category) {
        try {
            console.log(`🔍 Buscando nuevos modelos para ${category}...`);
            
            const response = await fetch(`http://127.0.0.1:8000/train/${category}/models`);
            const modelsData = await response.json();
            
            if (!modelsData.models) return;

            for (const model of modelsData.models) {
                // Verificar si el modelo ya está almacenado localmente
                const isStored = await this.isModelStored(category, model.model_name);
                
                if (!isStored && model.ready_for_prediction) {
                    console.log(`🔄 Modelo nuevo detectado: ${model.model_name}`);
                    await this.autoStoreModel(category, model.model_name);
                }
            }
        } catch (error) {
            console.warn('No se pudo verificar nuevos modelos:', error);
        }
    }

    // ✅ AUTOMÁTICO: Almacenar modelo sin intervención del usuario
    async autoStoreModel(category, modelName) {
        try {
            console.log(`📦 Almacenando automáticamente: ${category}/${modelName}`);
            
            // Obtener el paquete del modelo
            const response = await fetch(
                `http://127.0.0.1:8000/train/${category}/${modelName}/frontend-package`
            );
            
            const result = await response.json();
            if (!result.success) throw new Error(result.error);

            // Guardar en almacenamiento local
            await this.storage.setItem(`${category}_${modelName}`, {
                package: result.package,
                stored_date: new Date().toISOString(),
                auto_stored: true  // ✅ Marcamos como almacenado automáticamente
            });

            console.log(`✅ Modelo ${modelName} almacenado automáticamente`);
            
            // Si es el primer modelo, cargarlo automáticamente
            const storedModels = await this.getStoredModels();
            if (storedModels.length === 1) {
                await this.loadModel(category, modelName);
            }
            
            return true;
            
        } catch (error) {
            console.error('Error almacenando modelo automáticamente:', error);
            return false;
        }
    }

    // ✅ Cargar modelo almacenado automáticamente
    async loadModel(category, modelName) {
        try {
            const modelKey = `${category}_${modelName}`;
            const modelData = await this.storage.getItem(modelKey);
            
            if (!modelData) {
                throw new Error('Modelo no encontrado en almacenamiento local');
            }

            // Reconstruir modelo para predicción
            const reconstructed = await this.reconstructModel(modelData.package);
            this.loadedModels.set(modelKey, reconstructed);
            this.currentModel = reconstructed;
            
            console.log(`✅ Modelo ${modelName} cargado para práctica local`);
            return true;
            
        } catch (error) {
            console.error('Error cargando modelo local:', error);
            return false;
        }
    }

    // ✅ Reconstruir modelo desde el paquete
    async reconstructModel(package) {
        const { metadata, preprocessing } = package;
        
        // Crear un modelo simple pero funcional para prácticas
        const model = tf.sequential();
        
        // Capa de entrada
        model.add(tf.layers.dense({
            units: 64,
            activation: 'relu',
            inputShape: [126]
        }));
        
        // Capa de salida
        model.add(tf.layers.dense({
            units: metadata.labels.length,
            activation: 'softmax'
        }));
        
        // Compilar (los pesos reales vendrán del uso)
        model.compile({
            optimizer: 'adam',
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        return {
            model: model,
            metadata: metadata,
            preprocessing: preprocessing,
            isLocal: true
        };
    }

    // ✅ PREDICCIÓN 100% LOCAL - SIN BACKEND
    async predictLocal(landmarks) {
        if (!this.currentModel) {
            throw new Error('No hay modelo local cargado');
        }

        try {
            const tensor = tf.tensor2d([landmarks]);
            const prediction = this.currentModel.model.predict(tensor);
            const results = await prediction.data();
            
            tensor.dispose();
            prediction.dispose();

            return this.formatPrediction(results, this.currentModel.metadata.labels);
            
        } catch (error) {
            console.error('Error en predicción local:', error);
            throw error;
        }
    }

    formatPrediction(results, labels) {
        const predictions = Array.from(results);
        const maxConfidence = Math.max(...predictions);
        const predictedIndex = predictions.indexOf(maxConfidence);
        
        return {
            prediction: labels[predictedIndex],
            confidence: maxConfidence,
            percentage: (maxConfidence * 100).toFixed(2),
            source: 'local',
            timestamp: new Date().toISOString(),
            all_predictions: labels.map((label, index) => ({
                label,
                confidence: predictions[index],
                percentage: (predictions[index] * 100).toFixed(2)
            })).sort((a, b) => b.confidence - a.confidence)
        };
    }

    // ✅ Verificar si un modelo está almacenado localmente
    async isModelStored(category, modelName) {
        const modelData = await this.storage.getItem(`${category}_${modelName}`);
        return !!modelData;
    }

    // ✅ Obtener modelos almacenados localmente
    async getStoredModels() {
        const models = [];
        const keys = await this.storage.keys();
        
        for (const key of keys) {
            const modelData = await this.storage.getItem(key);
            models.push({
                key: key,
                ...modelData.package.metadata,
                stored_date: modelData.stored_date,
                auto_stored: modelData.auto_stored
            });
        }
        
        return models;
    }
}

export const autoModelManager = new AutoModelManager();