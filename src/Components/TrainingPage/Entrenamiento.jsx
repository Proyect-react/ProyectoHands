// src/Components/TrainingPage/TrainPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import apiService from '../../services/apiService';
import modelDownloadService from '../../services/modelDownloadService';
import tfjsTrainer from '../../services/tfjsTrainer';
import './TrainingPage.css';

const categories = {
  vocales: {
    name: 'Vocales',
    labels: ['A', 'E', 'I', 'O', 'U'],
    color: '#4CAF50'
  },
  numeros: {
    name: 'Números',
    labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    color: '#2196F3'
  },
  operaciones: {
    name: 'Operaciones',
    labels: ['+', '-', '*', '/', '='],
    color: '#FF9800'
  },
  palabras: {
    name: 'Palabras',
    labels: ['hola', 'gracias', 'por_favor', 'si', 'no'],
    color: '#9C27B0'
  }
};

const TrainPage = () => {
  const [selectedCategory, setSelectedCategory] = useState('vocales');
  const [modelName, setModelName] = useState("modelo_local");
  const [epochs, setEpochs] = useState(50);
  const [trainingProgress, setTrainingProgress] = useState(null);
  const [datasetStatus, setDatasetStatus] = useState({});
  const [downloadStatus, setDownloadStatus] = useState({
    checking: false,
    downloading: false,
    progress: 0,
    message: '',
    downloadedModels: [],
    errors: []
  });

  // ========== FUNCIONES DE DESCARGA ==========

  const checkAndDownloadModels = useCallback(async (category = null) => {
    try {
      setDownloadStatus(prev => ({
        ...prev,
        checking: true,
        message: 'Verificando modelos disponibles...'
      }));

      const result = await modelDownloadService.checkAndDownloadModels(category);

      setDownloadStatus(prev => ({
        ...prev,
        checking: false,
        downloading: false,
        downloadedModels: result.downloaded,
        errors: result.errors,
        message: result.downloaded.length > 0
          ? `✅ ${result.downloaded.length} modelos descargados`
          : result.errors.length > 0
            ? `⚠️ ${result.errors.length} errores en descarga`
            : '✅ Todos los modelos están actualizados'
      }));

      return result;

    } catch (error) {
      console.error('❌ Error en verificación automática:', error);
      setDownloadStatus(prev => ({
        ...prev,
        checking: false,
        downloading: false,
        message: `❌ Error: ${error.message}`,
        errors: [{ error: error.message }]
      }));
    }
  }, []);

  // ========== FUNCIONES PARA SUBIR MODELO AL BACKEND ==========

  const uploadModelToBackend = async (model, category, modelName, labels) => {
    try {
      console.log("🚀 Subiendo modelo...");

      const sanitizedModelName = modelName
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .toLowerCase();

      console.log(`📝 Nombre original: "${modelName}" -> Sanitizado: "${sanitizedModelName}"`);

      const modelArtifacts = await model.save(tf.io.withSaveHandler(async (artifacts) => {
        const weightsFileName = `weights.bin`;

        const modelJsonCorrect = {
          modelTopology: artifacts.modelTopology,
          weightsManifest: [
            {
              paths: [weightsFileName],
              weights: artifacts.weightSpecs
            }
          ],
          format: "layers-model",
          generatedBy: "TensorFlow.js tfjs-layers v4.0.0",
          convertedBy: "HandSignAI Frontend Training System v1.0",
        };

        const formData = new FormData();

        const modelJsonBlob = new Blob(
          [JSON.stringify(modelJsonCorrect, null, 2)],
          { type: 'application/json' }
        );
        formData.append('model_json', modelJsonBlob, `${sanitizedModelName}_model.json`);

        const weightsBlob = new Blob([artifacts.weightData], {
          type: 'application/octet-stream'
        });
        formData.append('weights_bin', weightsBlob, weightsFileName);

        formData.append('category', category);
        formData.append('model_name', sanitizedModelName);
        formData.append('upload_timestamp', new Date().toISOString());
        formData.append('labels', JSON.stringify(labels));

        const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://backend-c2aj.onrender.com';
        const uploadUrl = `${API_BASE_URL}/train/upload-tfjs-model`;

        const response = await fetch(uploadUrl, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Error del servidor:", response.status, errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log("✅ Respuesta del servidor:", result);

        return result;
      }));

      console.log("🎉 UPLOAD COMPLETO - Modelo subido exitosamente!");

      return {
        success: true,
        message: `Modelo ${sanitizedModelName} subido correctamente`,
        sanitizedName: sanitizedModelName,
        originalName: modelName,
        artifacts: modelArtifacts
      };

    } catch (error) {
      console.error("❌ Error en upload:", error);
      return {
        success: false,
        message: `Error: ${error.message}`,
        error: error
      };
    }
  };

  // ========== FUNCIONES DE ENTRENAMIENTO ==========

  const handleLocalTraining = async () => {
    try {
      setTrainingProgress({ status: 'training', progress: 0, message: 'Validando datos...' });

      const backendStatus = await apiService.getDatasetStatus(selectedCategory);
      console.log('📊 Estado del dataset en backend:', backendStatus);

      setTrainingProgress({ status: 'training', progress: 10, message: 'Descargando datos del backend...' });

      const backendData = await apiService.downloadTrainingData(selectedCategory);

      console.log('📥 Datos descargados del backend:', {
        categoria: backendData.category,
        muestras: backendData.statistics.total_samples,
        etiquetas: backendData.statistics.total_labels,
        labels: backendData.labels,
        shapeX: backendData.statistics.features_per_sample
      });

      if (!backendData.X || backendData.X.length === 0) {
        throw new Error(`No hay muestras disponibles en el backend para la categoría '${selectedCategory}'`);
      }

      const X = backendData.X;
      const y = backendData.y;
      const labels = backendData.labels;

      setTrainingProgress({ status: 'training', progress: 20, message: 'Iniciando entrenamiento local...' });

      console.log('🧠 Iniciando entrenamiento local con TensorFlow.js...');
      const result = await tfjsTrainer.trainModel(
        X, y, labels, epochs, 16,
        (progress, message) => {
          console.log(`📈 Progreso: ${progress}% - ${message}`);
          setTrainingProgress({ status: 'training', progress: Math.min(85, progress), message });
        }
      );

      console.log('🎯 Resultado del entrenamiento:', result);

      if (!result || !result.model) {
        throw new Error('El entrenamiento no devolvió un modelo válido');
      }

      if (!result.labels || result.labels.length === 0) {
        console.warn('⚠️ No se devolvieron etiquetas, usando las originales');
        result.labels = labels;
      }

      setTrainingProgress({ status: 'training', progress: 90, message: 'Guardando modelo local...' });

      console.log('💾 Guardando modelo local...');
      const modelInfo = await tfjsTrainer.saveModel(
        selectedCategory,
        modelName,
        result.model,
        result.labels
      );

      console.log('✅ Modelo guardado localmente:', modelInfo);

      setTrainingProgress({ status: 'training', progress: 95, message: 'Subiendo modelo al backend...' });

      try {
        await uploadModelToBackend(result.model, selectedCategory, modelName, result.labels);
        console.log('🎉 ¡Modelo subido exitosamente al backend!');
      } catch (uploadError) {
        console.warn('⚠️ Modelo no se pudo subir al backend, pero está guardado localmente:', uploadError);
      }

      setTrainingProgress({
        status: 'completed',
        progress: 100,
        message: '✅ Modelo entrenado localmente y subido al backend',
        metrics: {
          accuracy: (result.finalAccuracy * 100).toFixed(1) + '%',
          loss: result.finalLoss.toFixed(4)
        }
      });

      await checkAndDownloadModels(selectedCategory);

      console.log('🎉 ¡Entrenamiento local completado exitosamente!');

    } catch (error) {
      console.error('❌ Error detallado en entrenamiento local:', error);

      setTrainingProgress({
        status: 'error',
        progress: 0,
        message: `❌ Error: ${error.message}`
      });

      setTimeout(() => {
        alert(`Error en entrenamiento:\n${error.message}\n\nRevisa la consola para más detalles.`);
      }, 500);
    }
  };

  const handleStartTraining = async () => {
    await handleLocalTraining();
  };

  const loadBackendDatasetStatus = useCallback(async () => {
    try {
      const status = await apiService.getDatasetStatus(selectedCategory);
      setDatasetStatus(status);
    } catch (error) {
      console.error('Error cargando estado del backend:', error);
      setDatasetStatus({ labels: {}, summary: { total_samples: 0 } });
    }
  }, [selectedCategory]);

  const handleCategoryChange = async (newCategory) => {
    setSelectedCategory(newCategory);
    await loadBackendDatasetStatus();
  };

  // ========== EFECTOS ==========

  useEffect(() => {
    loadBackendDatasetStatus();
  }, [selectedCategory, loadBackendDatasetStatus]);

  // ========== RENDER ==========

  return (
    <div className="training-content">
      {/* Panel izquierdo - Controles */}
      <div className="control-panel">
        <div className="train-panel" style={{ padding: '15px', background: '#f5f5f5', borderRadius: '10px' }}>
          <h4>Configuración de Entrenamiento:</h4>

          {/* Selector de Categoría */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
              Categoría:
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '5px',
                border: '1px solid #ccc',
                fontSize: '14px'
              }}
            >
              {Object.entries(categories).map(([key, category]) => (
                <option key={key} value={key}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
              Nombre del Modelo:
            </label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="modelo_local"
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '5px',
                border: '1px solid #ccc',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
              Número de Épocas:
            </label>
            <input
              type="number"
              value={epochs}
              onChange={(e) => setEpochs(parseInt(e.target.value))}
              min="1"
              max="200"
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '5px',
                border: '1px solid #ccc',
                fontSize: '14px'
              }}
            />
          </div>

          <button
            onClick={handleStartTraining}
            disabled={trainingProgress?.status === 'training'}
            style={{
              background: trainingProgress?.status === 'training' ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '12px 15px',
              borderRadius: '5px',
              cursor: trainingProgress?.status === 'training' ? 'not-allowed' : 'pointer',
              width: '100%',
              fontWeight: '600',
              fontSize: '16px'
            }}
          >
            {trainingProgress?.status === 'training' ? '🔄 Entrenando...' : '🚀 Iniciar Entrenamiento Local'}
          </button>

          {/* Progreso del Entrenamiento */}
          {trainingProgress && (
            <div style={{
              marginTop: '15px',
              padding: '15px',
              background: trainingProgress.status === 'error' ? '#ffebee' :
                trainingProgress.status === 'completed' ? '#e8f5e8' : '#e3f2fd',
              borderRadius: '5px'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '10px' }}>
                {trainingProgress.status === 'training' ? '🔄 Entrenando...' :
                  trainingProgress.status === 'completed' ? '✅ Entrenamiento Completado' :
                    '❌ Error en Entrenamiento'}
              </div>

              {trainingProgress.status === 'training' && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{
                    width: '100%',
                    height: '20px',
                    background: '#f0f0f0',
                    borderRadius: '10px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${trainingProgress.progress}%`,
                      height: '100%',
                      background: '#4CAF50',
                      transition: 'width 0.3s ease'
                    }}></div>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '12px', marginTop: '5px' }}>
                    {trainingProgress.progress}% - {trainingProgress.message}
                  </div>
                </div>
              )}

              {trainingProgress.status === 'completed' && trainingProgress.metrics && (
                <div style={{ fontSize: '14px' }}>
                  <div><strong>Precisión:</strong> {trainingProgress.metrics.accuracy}</div>
                  <div><strong>Pérdida:</strong> {trainingProgress.metrics.loss}</div>
                </div>
              )}

              {trainingProgress.status === 'error' && (
                <div style={{ fontSize: '14px', color: '#d32f2f' }}>
                  {trainingProgress.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Panel derecho - Información */}
      <div className="info-panel">
        <div className="info-card">
          <h4>📊 Estado del Dataset</h4>
          <div className="dataset-summary">
            <div className="summary-item">
              <strong>Categoría:</strong> {categories[selectedCategory]?.name}
            </div>
            <div className="summary-item">
              <strong>Total muestras:</strong> {datasetStatus.summary?.total_samples || 0}
            </div>
            <div className="summary-item">
              <strong>Etiquetas:</strong> {categories[selectedCategory]?.labels.length || 0}
            </div>
          </div>
        </div>

        <div className="info-card">
          <h4>🔍 Verificación de Modelos</h4>
          <div className="download-status">
            <div className="status-message">
              <strong>🤖 Modelos:</strong> {downloadStatus.message}
            </div>
            <button
              onClick={() => checkAndDownloadModels(selectedCategory)}
              disabled={downloadStatus.checking || downloadStatus.downloading}
              style={{
                background: '#2196F3',
                color: 'white',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '12px',
                width: '100%',
                marginTop: '10px'
              }}
            >
              {downloadStatus.checking ? '🔍 Verificando...' :
                downloadStatus.downloading ? '⬇️ Descargando...' :
                  '🔄 Verificar'}
            </button>
          </div>

          {(downloadStatus.downloadedModels.length > 0 || downloadStatus.errors.length > 0) && (
            <div style={{ fontSize: '12px', marginTop: '10px', color: '#666', textAlign: 'center' }}>
              ✅ Descargados: {downloadStatus.downloadedModels.length} |
              ❌ Errores: {downloadStatus.errors.length}
            </div>
          )}
        </div>

        <div className="info-card">
          <h4>💡 Información del Entrenamiento</h4>
          <div style={{ fontSize: '14px', lineHeight: '1.5' }}>
            <p><strong>Requisitos:</strong></p>
            <ul style={{ paddingLeft: '20px', margin: '10px 0' }}>
              <li>Mínimo 30 muestras por etiqueta</li>
              <li>Datos balanceados entre categorías</li>
              <li>Conexión a internet para subir modelo</li>
            </ul>
            <p><strong>Recomendaciones:</strong></p>
            <ul style={{ paddingLeft: '20px', margin: '10px 0' }}>
              <li>50-100 épocas para mejor precisión</li>
              <li>Verificar datos antes de entrenar</li>
              <li>Probar modelo después del entrenamiento</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainPage;