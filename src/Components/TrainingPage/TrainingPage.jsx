// src/Components/TrainingPage/TrainingPage.jsx - VERSIÓN CON MEDIAPIPECAMERA
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import apiService from '../../services/apiService';
import './TrainingPage.css';

// 🆕 NUEVO SERVICIO DE DESCARGA
import modelDownloadService from '../../services/modelDownloadService';
// Servicios locales (solo para entrenamiento)
import localDataManager from '../../services/localDataManager';
import tfjsTrainer from '../../services/tfjsTrainer';

// 🆕 IMPORTAR MEDIAPIPECAMERA
import MediaPipeCamera from '../Camara/MediaPipeCamera';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

const TrainingIntegrated = () => {
  // 🆕 ELIMINAR referencias de cámara locales
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);

  // Estados principales
  const [mode, setMode] = useState('collect');
  const [selectedCategory, setSelectedCategory] = useState('vocales');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [modelName, setModelName] = useState("modelo_local");
  const [epochs, setEpochs] = useState(50);

  // Estados de datos
  const [datasetStatus, setDatasetStatus] = useState({});
  const [trainingProgress, setTrainingProgress] = useState(null);
  const [predictionResult, setPredictionResult] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);

  // 🆕 ESTADOS PARA DESCARGA AUTOMÁTICA
  const [downloadStatus, setDownloadStatus] = useState({
    checking: false,
    downloading: false,
    progress: 0,
    message: '',
    downloadedModels: [],
    errors: []
  });

  // Estados para buffer (mantener funcionalidad existente)
  const [bufferStatus, setBufferStatus] = useState({
    count: 0,
    totalCollected: 0,
    sending: false,
    lastSent: null
  });

  // Definición de categorías y sus etiquetas
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

  // Referencias para control de estado
  const collectingRef = useRef(false);
  const selectedLabelRef = useRef('');
  const lastCollectionTime = useRef(0);
  const processingRef = useRef(false);

  // Buffer para muestras (mantener funcionalidad existente)
  const sampleBufferRef = useRef([]);
  const BUFFER_SIZE = 10;
  const bufferStatusRef = useRef({
    count: 0,
    totalCollected: 0,
    sending: false
  });

  // Configuración de rendimiento
  const COLLECTION_INTERVAL = 1000;
  const RENDER_THROTTLE = 100;
  const lastRenderTime = useRef(0);
  const MIN_HAND_SIZE = 0.17;

  // ========== 🆕 FUNCIONES DE DESCARGA AUTOMÁTICA ==========

  const checkAndDownloadModels = useCallback(async (category = null) => {
    try {
      setDownloadStatus(prev => ({
        ...prev,
        checking: true,
        message: 'Verificando modelos disponibles...'
      }));

      console.log('🔍 Iniciando verificación automática de modelos...');

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

      // Actualizar lista de modelos disponibles para práctica
      await loadDownloadedModels();

      console.log('📊 Resultado de verificación:', result);

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

  const loadDownloadedModels = useCallback(async () => {
  try {
    // 🆕 CARGAR MODELOS PERSISTIDOS PRIMERO
    await modelDownloadService.loadPersistedModels();
    
    // Obtener modelos descargados para la categoría actual
    const downloadedModels = modelDownloadService.getDownloadedModels(selectedCategory);

    console.log(`📋 Modelos descargados para ${selectedCategory}:`, downloadedModels);

    // Resto del código igual...
      // Convertir al formato esperado por el componente
      const formattedModels = downloadedModels.map(model => ({
        model_name: model.model_name,
        accuracy: model.accuracy,
        samples_used: model.samples_used,
        category: model.category,
        training_date: model.training_date,
        labels: model.labels || [],
        ready_for_prediction: true, // Siempre true para modelos descargados
        source: 'downloaded' // 🆕 Indicar que es un modelo descargado
      }));

      // 🆕 COMBINAR con modelos locales si existen
      const localModels = await tfjsTrainer.getLocalModels(selectedCategory);
      const localModelsFormatted = localModels.map(model => ({
        ...model,
        source: 'local' // Indicar que es un modelo local
      }));

      const allModels = [...formattedModels, ...localModelsFormatted];

      setAvailableModels(allModels);

      // Auto-seleccionar el primer modelo descargado si no hay uno seleccionado
      if (!selectedModel && formattedModels.length > 0) {
        setSelectedModel(formattedModels[0].model_name);
      }

    } catch (error) {
      console.error('❌ Error cargando modelos descargados:', error);
      setAvailableModels([]);
    }
  }, [selectedCategory, selectedModel]);

  // 🆕 Predicción usando modelos descargados
  const predictWithDownloadedModel = async (landmarks) => {
    try {
      if (!selectedModel) {
        throw new Error('No hay modelo seleccionado');
      }

      // Verificar si es un modelo descargado o local
      const selectedModelInfo = availableModels.find(m => m.model_name === selectedModel);

      if (!selectedModelInfo) {
        throw new Error('Información del modelo no encontrada');
      }

      let predictions;
      let labels;

      if (selectedModelInfo.source === 'downloaded') {
        // 🆕 Usar servicio de descarga para modelos del backend
        predictions = await modelDownloadService.predict(selectedCategory, selectedModel, landmarks);
        const modelData = await modelDownloadService.loadModel(selectedCategory, selectedModel);
        labels = modelData.labels;
      } else {
        // Usar entrenador local para modelos entrenados localmente
        if (!tfjsTrainer.hasModel(selectedCategory, selectedModel)) {
          throw new Error('Modelo local no cargado en memoria');
        }
        predictions = await tfjsTrainer.predict(selectedCategory, selectedModel, landmarks);
        labels = await tfjsTrainer.getModelLabels(selectedCategory, selectedModel);
      }

      // Encontrar la predicción con mayor confianza
      const maxConfidence = Math.max(...predictions);
      const predictedIndex = predictions.indexOf(maxConfidence);
      const predictedLabel = labels[predictedIndex];

      // Crear ranking top 3
      const ranking = predictions.map((confidence, index) => ({
        label: labels[index],
        confidence: confidence,
        percentage: (confidence * 100).toFixed(1)
      })).sort((a, b) => b.confidence - a.confidence).slice(0, 3);

      return {
        prediction: predictedLabel,
        confidence: maxConfidence,
        percentage: (maxConfidence * 100).toFixed(1),
        high_confidence: maxConfidence > 0.7,
        top_3: ranking,
        model_source: selectedModelInfo.source // 🆕 Indicar fuente del modelo
      };

    } catch (error) {
      console.error('❌ Error en predicción:', error);
      return null;
    }
  };

  // ========== FUNCIONES PARA SUBIR MODELO AL BACKEND (mantener) ==========

  const uploadModelToBackend = async (model, category, modelName, labels) => {
    try {
      console.log("🚀 UPLOAD CORREGIDO - Subiendo modelo...");

      // 🔥 SANITIZAR EL NOMBRE DEL MODELO
      const sanitizedModelName = modelName
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .toLowerCase();

      console.log(`📝 Nombre original: "${modelName}" -> Sanitizado: "${sanitizedModelName}"`);

      const modelArtifacts = await model.save(tf.io.withSaveHandler(async (artifacts) => {
        console.log("📦 Artifacts capturados:");
        console.log("  - modelTopology:", !!artifacts.modelTopology);
        console.log("  - weightData:", artifacts.weightData?.byteLength, "bytes");
        console.log("  - weightSpecs:", artifacts.weightSpecs?.length, "pesos");

        // 🔥 FIX CRÍTICO: NOMBRES CONSISTENTES
        const weightsFileName = `weights.bin`; // Mantener consistencia

        // ✅ CONSTRUIR model.json CORRECTO CON TRAINING CONFIG VÁLIDO
        const modelJsonCorrect = {
          modelTopology: artifacts.modelTopology,

          // 🔥 WEIGHTS MANIFEST CON NOMBRE CORRECTO
          weightsManifest: [
            {
              paths: [weightsFileName], // MISMO nombre que se guardará
              weights: artifacts.weightSpecs
            }
          ],

          format: "layers-model",
          generatedBy: "TensorFlow.js tfjs-layers v4.0.0",
          convertedBy: "HandSignAI Frontend Training System v1.0",

        };

        console.log("✅ model.json construido:");
        console.log("  - modelTopology:", !!modelJsonCorrect.modelTopology);
        console.log("  - weightsManifest:", !!modelJsonCorrect.weightsManifest);
        console.log("  - weightsManifest[0].paths:", modelJsonCorrect.weightsManifest[0].paths);
        console.log("  - trainingConfig:", !!modelJsonCorrect.trainingConfig);

        // ✅ CREAR FormData con nombres CONSISTENTES
        const formData = new FormData();

        // Agregar model.json
        const modelJsonBlob = new Blob(
          [JSON.stringify(modelJsonCorrect, null, 2)],
          { type: 'application/json' }
        );
        formData.append('model_json', modelJsonBlob, `${sanitizedModelName}_model.json`);

        // Agregar weights.bin CON EL MISMO NOMBRE que está en weightsManifest
        const weightsBlob = new Blob([artifacts.weightData], {
          type: 'application/octet-stream'
        });
        formData.append('weights_bin', weightsBlob, weightsFileName); // CONSISTENTE

        // Metadata
        formData.append('category', category);
        formData.append('model_name', sanitizedModelName);
        formData.append('upload_timestamp', new Date().toISOString());
        formData.append('labels', JSON.stringify(labels));

        console.log("📤 Archivos preparados:");
        console.log(`  - model.json: ${modelJsonBlob.size} bytes`);
        console.log(`  - weights.bin: ${weightsBlob.size} bytes (como ${weightsFileName})`);

        // ✅ SUBIR AL BACKEND
        const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://backend-c2aj.onrender.com';
        const uploadUrl = `${API_BASE_URL}/train/upload-tfjs-model`;

        console.log(`🌐 Subiendo a: ${uploadUrl}`);

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

  // ========== FUNCIONES PARA BACKEND (RECOLECCIÓN) - mantener ==========

  const loadBackendDatasetStatus = useCallback(async () => {
    try {
      const status = await apiService.getDatasetStatus(selectedCategory);
      setDatasetStatus(status);
    } catch (error) {
      console.error('Error cargando estado del backend:', error);
      setDatasetStatus({ labels: {}, summary: { total_samples: 0 } });
    }
  }, [selectedCategory]);

  // ========== FUNCIONES DE BUFFER - mantener ==========

  const sendBufferToBackend = useCallback(async () => {
    if (sampleBufferRef.current.length === 0 || bufferStatusRef.current.sending) {
      return;
    }

    console.log(`🚀 Enviando ${sampleBufferRef.current.length} muestras al backend...`);

    setBufferStatus(prev => ({ ...prev, sending: true }));
    bufferStatusRef.current.sending = true;

    try {
      const samplesToSend = [...sampleBufferRef.current];
      const batchResult = await apiService.collectBatchSamples(selectedCategory, samplesToSend);

      console.log(`✅ Lote enviado exitosamente:`, batchResult);

      sampleBufferRef.current = [];
      setBufferStatus(prev => ({
        ...prev,
        count: 0,
        sending: false,
        lastSent: new Date().toISOString()
      }));

      bufferStatusRef.current.count = 0;
      bufferStatusRef.current.sending = false;

      await loadBackendDatasetStatus();

    } catch (error) {
      console.error('❌ Error enviando lote al backend:', error);
      setBufferStatus(prev => ({ ...prev, sending: false }));
      bufferStatusRef.current.sending = false;
    }
  }, [selectedCategory, loadBackendDatasetStatus]);

  const addToBuffer = useCallback((landmarks, label) => {
    const currentSamples = getLabelSamples(label);
    if (currentSamples >= 30) {
      setIsCollecting(false);
      collectingRef.current = false;
      return;
    }

    const sample = {
      landmarks,
      label,
      timestamp: new Date().toISOString(),
      id: Date.now() + Math.random()
    };

    sampleBufferRef.current.push(sample);

    const newCount = sampleBufferRef.current.length;
    const newTotal = bufferStatusRef.current.totalCollected + 1;

    setBufferStatus(prev => ({
      ...prev,
      count: newCount,
      totalCollected: newTotal
    }));

    bufferStatusRef.current.count = newCount;
    bufferStatusRef.current.totalCollected = newTotal;

    console.log(`📦 Buffer: ${newCount}/10 | ${label}: ${currentSamples}/30`);

    if (newCount >= BUFFER_SIZE) {
      sendBufferToBackend();
    }
  }, [sendBufferToBackend]);

  const flushBuffer = useCallback(async () => {
    if (sampleBufferRef.current.length > 0) {
      console.log(`🔄 Enviando muestras restantes: ${sampleBufferRef.current.length}`);
      await sendBufferToBackend();
    }
  }, [sendBufferToBackend]);

  const clearBuffer = useCallback(() => {
    sampleBufferRef.current = [];
    setBufferStatus({
      count: 0,
      totalCollected: 0,
      sending: false,
      lastSent: null
    });
    bufferStatusRef.current = {
      count: 0,
      totalCollected: 0,
      sending: false
    };
    console.log('🧹 Buffer limpiado');
  }, []);

  // ========== FUNCIONES PARA ENTRENAMIENTO LOCAL - mantener ==========

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

      // 🆕 Después del entrenamiento, verificar nuevos modelos automáticamente
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

  // ========== FUNCIONES AUXILIARES ==========

  const extractLandmarksArray = (multiHandLandmarks) => {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) return null;

    const landmarks = [];

    for (let i = 0; i < Math.min(2, multiHandLandmarks.length); i++) {
      for (const landmark of multiHandLandmarks[i]) {
        landmarks.push(landmark.x, landmark.y, landmark.z);
      }
    }

    if (multiHandLandmarks.length === 1) {
      for (let i = 0; i < 63; i++) {
        landmarks.push(0.0);
      }
    }

    return landmarks.length === 126 ? landmarks : null;
  };

  const calcularTamanioMano = (landmarks) => {
    if (!landmarks || landmarks.length === 0) return 0;
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const punto of landmarks) {
      if (punto.x < minX) minX = punto.x;
      if (punto.x > maxX) maxX = punto.x;
      if (punto.y < minY) minY = punto.y;
      if (punto.y > maxY) maxY = punto.y;
    }
    return maxX - minX;
  };

  // ========== EFECTOS ==========

  useEffect(() => {
    collectingRef.current = isCollecting;
  }, [isCollecting]);

  useEffect(() => {
    selectedLabelRef.current = selectedLabel;
  }, [selectedLabel]);

  useEffect(() => {
    bufferStatusRef.current = bufferStatus;
  }, [bufferStatus]);

  // 🆕 EFECTO PRINCIPAL - Verificación automática al cargar
  useEffect(() => {
    const initializeModels = async () => {
      console.log('🚀 Inicializando verificación automática de modelos...');

      // Cargar estado del dataset del backend
      await loadBackendDatasetStatus();

      // 🆕 Verificar y descargar modelos automáticamente
      await checkAndDownloadModels(selectedCategory);
    };

    initializeModels();
  }, [selectedCategory, loadBackendDatasetStatus, checkAndDownloadModels]);

  // Limpiar buffer al cambiar de categoría o etiqueta
  useEffect(() => {
    clearBuffer();
  }, [selectedCategory, selectedLabel, clearBuffer]);

  // ========== 🆕 HANDLER PARA MEDIAPIPECAMERA ==========

  const handleHandDetected = useCallback((landmarksArray, rawLandmarks) => {
    if (!landmarksArray) return;

    const now = Date.now();

    // MODO RECOLECCIÓN
    if (mode === 'collect' && collectingRef.current && selectedLabelRef.current) {
      const currentSamples = getLabelSamples(selectedLabelRef.current);
      if (currentSamples >= 30) {
        setIsCollecting(false);
        return;
      }

      const timeSinceLastCollection = now - lastCollectionTime.current;

      if (timeSinceLastCollection > COLLECTION_INTERVAL && !processingRef.current) {
        processingRef.current = true;
        addToBuffer(landmarksArray, selectedLabelRef.current);
        lastCollectionTime.current = now;
        processingRef.current = false;
      }
    }

    // MODO PRÁCTICA
    else if (mode === 'practice' && selectedModel) {
      const handSize = calcularTamanioMano(rawLandmarks);

      if (handSize >= MIN_HAND_SIZE && now - lastCollectionTime.current > 500) {
        predictWithDownloadedModel(landmarksArray)
          .then(result => {
            if (result) setPredictionResult(result);
            lastCollectionTime.current = now;
          })
          .catch(error => {
            console.error('Error en predicción:', error);
          });
      } else if (handSize < MIN_HAND_SIZE) {
        setPredictionResult({
          prediction: "Acerca tu mano a la cámara",
          percentage: 0,
          high_confidence: false,
          top_3: []
        });
      }
    }
  }, [mode, selectedModel, addToBuffer, predictWithDownloadedModel]);

  // ========== HANDLERS ==========

  const handleStartTraining = async () => {
    await handleLocalTraining();
  };

  const handleClearData = async (type = 'current') => {
    if (type === 'current' && !selectedLabel) {
      alert('Selecciona una etiqueta primero');
      return;
    }

    const wasCollecting = isCollecting;
    if (wasCollecting) {
      setIsCollecting(false);
      collectingRef.current = false;
      await flushBuffer();
    }

    let confirmMessage = '';

    if (type === 'current') {
      const currentSamples = getLabelSamples(selectedLabel);
      confirmMessage = `¿Eliminar todas las muestras de "${selectedLabel}" del backend?\n\nSe eliminarán ${currentSamples} muestras.\n\nEsta acción NO se puede deshacer.`;
    } else if (type === 'all') {
      const totalSamples = datasetStatus.summary?.total_samples || 0;
      confirmMessage = `¿Eliminar TODAS las muestras de "${selectedCategory}" del backend?\n\nSe eliminarán ${totalSamples} muestras.\n\nEsta acción NO se puede deshacer.`;
    }

    const userConfirmed = window.confirm(`CONFIRMACIÓN\n\n${confirmMessage}`);
    if (!userConfirmed) {
      if (wasCollecting) {
        setIsCollecting(true);
        collectingRef.current = true;
      }
      return;
    }

    try {
      if (type === 'current') {
        await apiService.clearLabelData(selectedCategory, selectedLabel);
        alert(`Datos de "${selectedLabel}" eliminados del backend`);
      } else if (type === 'all') {
        await apiService.clearCategoryData(selectedCategory);
        alert(`Todas las muestras de "${selectedCategory}" eliminadas del backend`);
      }

      await loadBackendDatasetStatus();

    } catch (error) {
      alert(`Error eliminando datos del backend: ${error.message}`);
      console.error('Error eliminando:', error);

      if (wasCollecting) {
        setIsCollecting(true);
        collectingRef.current = true;
      }
    }
  };

  // Funciones auxiliares
  const getLabelSamples = (label) => {
    return datasetStatus.labels?.[label]?.samples || 0;
  };

  const isLabelReady = (label) => {
    return getLabelSamples(label) >= 30;
  };

  const getCurrentLabels = () => {
    return categories[selectedCategory]?.labels || [];
  };

  // Handlers básicos
  const handleStartCamera = async () => {
    try {
      // Verificar permisos primero
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 640, 
          height: 480,
          facingMode: 'user'
        } 
      });
      
      // Detener el stream de prueba
      stream.getTracks().forEach(track => track.stop());
      
      // Ahora sí, activar la cámara
      setIsCameraActive(true);
    } catch (error) {
      console.error('Error solicitando permisos:', error);
      alert(`No se pudo acceder a la cámara:\n${error.message}\n\nVerifica los permisos en tu navegador.`);
    }
  };

  const handleStopCamera = async () => {
    setIsCameraActive(false);
    setIsCollecting(false);
    collectingRef.current = false;
    processingRef.current = false;
    await flushBuffer();
  };

  const handleToggleCollection = () => {
    if (!selectedLabel) {
      alert('Selecciona una etiqueta primero');
      return;
    }

    const currentSamples = getLabelSamples(selectedLabel);
    if (currentSamples >= 30) {
      setIsCollecting(false);
      collectingRef.current = false;
      return;
    }

    const newCollecting = !isCollecting;

    setIsCollecting(newCollecting);
    collectingRef.current = newCollecting;

    if (newCollecting) {
      lastCollectionTime.current = 0;
      processingRef.current = false;
    } else {
      flushBuffer();
    }
  };

  const handleSwitchMode = async (newMode) => {
    console.log(`Cambiando a modo: ${newMode}`);
    setIsCollecting(false);
    collectingRef.current = false;
    processingRef.current = false;

    if (mode === 'collect') {
      await flushBuffer();
    }

    setMode(newMode);
    setPredictionResult(null);
    setTrainingProgress(null);
    lastCollectionTime.current = 0;
    lastRenderTime.current = 0;
  };

  const handleCategoryChange = async (newCategory) => {
    console.log(`Cambiando categoría a: ${newCategory}`);
    if (isCollecting) {
      setIsCollecting(false);
      collectingRef.current = false;
      await flushBuffer();
    }
    setSelectedCategory(newCategory);
    setSelectedLabel('');
    setSelectedModel('');
    setPredictionResult(null);
    clearBuffer();

    // 🆕 Recargar modelos para nueva categoría
    await checkAndDownloadModels(newCategory);
    await loadBackendDatasetStatus();
  };

  const handleLabelChange = async (label) => {
    const wasCollecting = isCollecting;
    if (wasCollecting) {
      setIsCollecting(false);
      collectingRef.current = false;
      await flushBuffer();
    }
    setSelectedLabel(label);
    selectedLabelRef.current = label;
    clearBuffer();

    const currentSamples = getLabelSamples(label);
    if (wasCollecting && currentSamples < 30) {
      setTimeout(() => {
        setIsCollecting(true);
        collectingRef.current = true;
        lastCollectionTime.current = 0;
      }, 500);
    }
  };

  // ========== RENDER ==========

  return (
    <div className="training-integrated">
      {/* Header */}
      <div className="training-header">
        <h1>Sistema de Entrenamiento IA</h1>
        <div className="mode-selector">
          <button
            className={mode === 'collect' ? 'active' : ''}
            onClick={() => handleSwitchMode('collect')}
          >
            📊 Recolectar
          </button>
          <button
            className={mode === 'train' ? 'active' : ''}
            onClick={() => handleSwitchMode('train')}
          >
            🧠 Entrenar
          </button>
          <button
            className={mode === 'practice' ? 'active' : ''}
            onClick={() => handleSwitchMode('practice')}
          >
            🎯 Practicar
          </button>
        </div>

        {/* 🆕 INDICADOR DE DESCARGA AUTOMÁTICA */}
        <div className="download-status" style={{
          marginTop: '10px',
          padding: '10px',
          background: downloadStatus.checking || downloadStatus.downloading ? '#fff3e0' :
            downloadStatus.downloadedModels.length > 0 ? '#e8f5e8' : '#f0f8ff',
          borderRadius: '5px',
          fontSize: '14px',
          color: '#333'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
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
                fontSize: '12px'
              }}
            >
              {downloadStatus.checking ? '🔍 Verificando...' :
                downloadStatus.downloading ? '⬇️ Descargando...' :
                  '🔄 Verificar'}
            </button>
          </div>

          {(downloadStatus.downloadedModels.length > 0 || downloadStatus.errors.length > 0) && (
            <div style={{ fontSize: '12px', marginTop: '5px', color: '#666' }}>
              ✅ Descargados: {downloadStatus.downloadedModels.length} |
              ❌ Errores: {downloadStatus.errors.length}
            </div>
          )}
        </div>
      </div>

      <div className="training-content">
        {/* Panel izquierdo - Controles */}
        <div className="control-panel">

          {/* Selector de Categoría */}
          <div className="category-selector" style={{ marginBottom: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '10px' }}>
            <h4>Seleccionar Categoría:</h4>
            <div className="category-buttons" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {Object.entries(categories).map(([key, category]) => (
                <button
                  key={key}
                  className={`category-btn ${selectedCategory === key ? 'selected' : ''}`}
                  onClick={() => handleCategoryChange(key)}
                  style={{
                    background: selectedCategory === key ? category.color : '#e0e0e0',
                    color: selectedCategory === key ? 'white' : '#333',
                    border: 'none',
                    padding: '8px 15px',
                    borderRadius: '20px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  {category.name}
                </button>
              ))}
            </div>
            <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
              Categoría actual: <strong>{categories[selectedCategory]?.name}</strong> ({getCurrentLabels().length} etiquetas)
            </p>
          </div>

          {/* Modo Recolección */}
          {mode === 'collect' && (
            <div className="collect-panel">

              <div className="label-selector">
                <h4>Seleccionar Etiqueta:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '8px' }}>
                  {getCurrentLabels().map(label => (
                    <button
                      key={label}
                      className={`label-btn ${selectedLabel === label ? 'selected' : ''} ${isLabelReady(label) ? 'ready' : ''}`}
                      onClick={() => handleLabelChange(label)}
                      style={{
                        background: selectedLabel === label ? categories[selectedCategory].color :
                          isLabelReady(label) ? '#4CAF50' : '#f0f0f0',
                        color: selectedLabel === label || isLabelReady(label) ? 'white' : '#333',
                        border: 'none',
                        padding: '10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        position: 'relative'
                      }}
                    >
                      {label}
                      {isLabelReady(label) && (
                        <span style={{
                          position: 'absolute',
                          top: '-5px',
                          right: '-5px',
                          background: '#4CAF50',
                          color: 'white',
                          borderRadius: '50%',
                          width: '20px',
                          height: '20px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Estado del Dataset */}
              <div className="dataset-status" style={{ marginTop: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '10px' }}>
                <h4>Estado del Dataset (Backend):</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
                  {getCurrentLabels().map(label => {
                    const samples = getLabelSamples(label);
                    const isReady = samples >= 30;
                    return (
                      <div key={label} style={{
                        padding: '8px',
                        background: isReady ? '#e8f5e8' : '#fff3e0',
                        borderRadius: '5px',
                        textAlign: 'center',
                        fontSize: '14px'
                      }}>
                        <div style={{ fontWeight: '600' }}>{label}</div>
                        <div style={{
                          color: isReady ? '#4CAF50' : '#FF9800',
                          fontSize: '12px'
                        }}>
                          {isReady ? '✅' : '⏳'} {samples}/30
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: '10px', padding: '10px', background: '#e3f2fd', borderRadius: '5px', fontSize: '14px' }}>
                  <strong>Total en backend:</strong> {datasetStatus.summary?.total_samples || 0} muestras
                </div>
              </div>

              {/* Controles de Recolección */}
              <div className="collection-controls" style={{ marginTop: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '10px' }}>
                <h4>Controles de Recolección:</h4>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <button
                    onClick={handleStartCamera}
                    disabled={isCameraActive}
                    style={{
                      background: isCameraActive ? '#ccc' : '#4CAF50',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '5px',
                      cursor: isCameraActive ? 'not-allowed' : 'pointer',
                      flex: 1
                    }}
                  >
                    {isCameraActive ? '📹 Cámara Activa' : '🎥 Iniciar Cámara'}
                  </button>

                  <button
                    onClick={handleStopCamera}
                    disabled={!isCameraActive}
                    style={{
                      background: !isCameraActive ? '#ccc' : '#f44336',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '5px',
                      cursor: !isCameraActive ? 'not-allowed' : 'pointer',
                      flex: 1
                    }}
                  >
                    🛑 Detener Cámara
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <button
                    onClick={handleToggleCollection}
                    disabled={!isCameraActive || !selectedLabel || isLabelReady(selectedLabel)}
                    style={{
                      background: !isCameraActive || !selectedLabel || isLabelReady(selectedLabel) ? '#ccc' :
                        isCollecting ? '#ff9800' : '#2196F3',
                      color: 'white',
                      border: 'none',
                      padding: '12px 15px',
                      borderRadius: '5px',
                      cursor: (!isCameraActive || !selectedLabel || isLabelReady(selectedLabel)) ? 'not-allowed' : 'pointer',
                      flex: 1,
                      fontWeight: '600',
                      fontSize: '16px'
                    }}
                  >
                    {isCollecting ? '⏸️ Pausar Recolección' : '▶️ Iniciar Recolección'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleClearData('current')}
                    disabled={!selectedLabel || getLabelSamples(selectedLabel) === 0}
                    style={{
                      background: !selectedLabel || getLabelSamples(selectedLabel) === 0 ? '#ccc' : '#ff9800',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '5px',
                      cursor: (!selectedLabel || getLabelSamples(selectedLabel) === 0) ? 'not-allowed' : 'pointer',
                      flex: 1
                    }}
                  >
                    🗑️ Limpiar {selectedLabel || 'Etiqueta'}
                  </button>

                  <button
                    onClick={() => handleClearData('all')}
                    disabled={!datasetStatus.summary?.total_samples || datasetStatus.summary.total_samples === 0}
                    style={{
                      background: (!datasetStatus.summary?.total_samples || datasetStatus.summary.total_samples === 0) ? '#ccc' : '#f44336',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '5px',
                      cursor: (!datasetStatus.summary?.total_samples || datasetStatus.summary.total_samples === 0) ? 'not-allowed' : 'pointer',
                      flex: 1
                    }}
                  >
                    🗑️ Limpiar Todo
                  </button>
                </div>

                {/* Estado del Buffer */}
                <div style={{ marginTop: '15px', padding: '10px', background: bufferStatus.sending ? '#fff3e0' : '#e8f5e8', borderRadius: '5px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>
                    📦 Buffer: {bufferStatus.count}/{BUFFER_SIZE} muestras
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {bufferStatus.sending ? '🔄 Enviando al backend...' :
                      bufferStatus.count > 0 ? `📤 ${bufferStatus.count} muestras pendientes` :
                        '✅ Buffer vacío'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    Total recolectado: {bufferStatus.totalCollected} muestras
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modo Entrenamiento */}
          {mode === 'train' && (
            <div className="train-panel" style={{ padding: '15px', background: '#f5f5f5', borderRadius: '10px' }}>
              <h4>Configuración de Entrenamiento:</h4>

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
          )}

          {/* Modo Práctica */}
          {mode === 'practice' && (
            <div className="practice-panel" style={{ padding: '15px', background: '#f5f5f5', borderRadius: '10px' }}>
              <h4>Configuración de Práctica:</h4>

              {/* Selector de Modelo */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Seleccionar Modelo:
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '5px',
                    border: '1px solid #ccc',
                    fontSize: '14px'
                  }}
                >
                  <option value="">-- Selecciona un modelo --</option>
                  {availableModels.map(model => (
                    <option key={model.model_name} value={model.model_name}>
                      {model.model_name} ({model.source === 'downloaded' ? '🔽' : '💾'}) - {model.accuracy}% - {model.samples_used} muestras
                    </option>
                  ))}
                </select>
              </div>

              {/* Controles de Cámara */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button
                  onClick={handleStartCamera}
                  disabled={isCameraActive}
                  style={{
                    background: isCameraActive ? '#ccc' : '#4CAF50',
                    color: 'white',
                    border: 'none',
                    padding: '10px 15px',
                    borderRadius: '5px',
                    cursor: isCameraActive ? 'not-allowed' : 'pointer',
                    flex: 1
                  }}
                >
                  {isCameraActive ? '📹 Cámara Activa' : '🎥 Iniciar Cámara'}
                </button>

                <button
                  onClick={handleStopCamera}
                  disabled={!isCameraActive}
                  style={{
                    background: !isCameraActive ? '#ccc' : '#f44336',
                    color: 'white',
                    border: 'none',
                    padding: '10px 15px',
                    borderRadius: '5px',
                    cursor: !isCameraActive ? 'not-allowed' : 'pointer',
                    flex: 1
                  }}
                >
                  🛑 Detener Cámara
                </button>
              </div>

              {/* Resultado de Predicción */}
              {predictionResult && (
                <div style={{
                  marginTop: '15px',
                  padding: '15px',
                  background: predictionResult.high_confidence ? '#e8f5e8' : '#fff3e0',
                  borderRadius: '10px',
                  border: `2px solid ${predictionResult.high_confidence ? '#4CAF50' : '#FF9800'}`
                }}>
                  <div style={{
                    fontSize: '24px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    marginBottom: '10px',
                    color: predictionResult.high_confidence ? '#2E7D32' : '#FF9800'
                  }}>
                    {predictionResult.prediction}
                  </div>

                  <div style={{
                    fontSize: '16px',
                    textAlign: 'center',
                    marginBottom: '15px',
                    color: '#666'
                  }}>
                    Confianza: {predictionResult.percentage}%
                  </div>

                  {predictionResult.top_3 && predictionResult.top_3.length > 0 && (
                    <div style={{ fontSize: '14px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '8px' }}>Top 3:</div>
                      {predictionResult.top_3.map((item, index) => (
                        <div key={index} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '5px 0',
                          borderBottom: '1px solid #f0f0f0'
                        }}>
                          <span>{item.label}</span>
                          <span>{item.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{
                    fontSize: '12px',
                    textAlign: 'center',
                    marginTop: '10px',
                    color: '#999'
                  }}>
                    Modelo: {selectedModel} ({predictionResult.model_source})
                  </div>
                </div>
              )}

              {/* Información del Modelo Seleccionado */}
              {selectedModel && (
                <div style={{
                  marginTop: '15px',
                  padding: '10px',
                  background: '#e3f2fd',
                  borderRadius: '5px',
                  fontSize: '12px'
                }}>
                  <div><strong>Modelo:</strong> {selectedModel}</div>
                  <div><strong>Categoría:</strong> {selectedCategory}</div>
                  <div><strong>Fuente:</strong> {
                    availableModels.find(m => m.model_name === selectedModel)?.source === 'downloaded' ?
                      '🔽 Descargado del Backend' : '💾 Entrenado Localmente'
                  }</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panel derecho - Cámara */}
        <div className="camera-panel">
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '640px',
            margin: '0 auto',
            background: '#000',
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            
            {/* 🆕 USAR MEDIAPIPECAMERA EN LUGAR DE LA CÁMARA ORIGINAL */}
            <MediaPipeCamera
              isActive={isCameraActive}
              onHandDetected={handleHandDetected}
              width={640}
              height={480}
            />

            {/* Overlay de información */}
            <div style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              right: '10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              {/* Indicador de Modo */}
              <div style={{
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                padding: '5px 10px',
                borderRadius: '5px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                {mode === 'collect' ? '📊 RECOLECCIÓN' :
                  mode === 'train' ? '🧠 ENTRENAMIENTO' :
                    '🎯 PRÁCTICA'}
              </div>

              {/* Información específica del modo */}
              {mode === 'collect' && (
                <div style={{
                  background: 'rgba(0,0,0,0.7)',
                  color: isCollecting ? '#4CAF50' : 'white',
                  padding: '5px 10px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  {isCollecting ? `🟢 COLECTANDO: ${selectedLabel}` : '⏸️ PAUSADO'}
                </div>
              )}

              {mode === 'practice' && selectedModel && (
                <div style={{
                  background: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  padding: '5px 10px',
                  borderRadius: '5px',
                  fontSize: '12px'
                }}>
                  MODELO: {selectedModel}
                </div>
              )}
            </div>

            {/* Instrucciones */}
            <div style={{
              position: 'absolute',
              bottom: '10px',
              left: '10px',
              right: '10px',
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              padding: '8px',
              borderRadius: '5px',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              {mode === 'collect' && (
                isCollecting ?
                  `🟢 Recolectando muestras para "${selectedLabel}" - Mantén tu mano estable` :
                  '⏸️ Selecciona una etiqueta e inicia la recolección'
              )}
              {mode === 'practice' && (
                selectedModel ?
                  '🎯 Realiza la seña frente a la cámara' :
                  '⏸️ Selecciona un modelo para comenzar'
              )}
              {mode === 'train' && (
                '🧠 Configura y ejecuta el entrenamiento'
              )}
            </div>
          </div>

          {/* Información adicional debajo de la cámara */}
          <div style={{ marginTop: '15px', textAlign: 'center' }}>
            {mode === 'collect' && selectedLabel && (
              <div style={{
                padding: '10px',
                background: isLabelReady(selectedLabel) ? '#e8f5e8' : '#fff3e0',
                borderRadius: '5px',
                fontSize: '14px'
              }}>
                {isLabelReady(selectedLabel) ? (
                  <span style={{ color: '#4CAF50', fontWeight: '600' }}>
                    ✅ {selectedLabel} completado (30/30 muestras)
                  </span>
                ) : (
                  <span style={{ color: '#FF9800' }}>
                    ⏳ {selectedLabel}: {getLabelSamples(selectedLabel)}/30 muestras
                  </span>
                )}
              </div>
            )}

            {mode === 'practice' && predictionResult && (
              <div style={{
                padding: '10px',
                background: predictionResult.high_confidence ? '#e8f5e8' : '#fff3e0',
                borderRadius: '5px',
                fontSize: '14px'
              }}>
                {predictionResult.high_confidence ? (
                  <span style={{ color: '#4CAF50', fontWeight: '600' }}>
                    ✅ Alta confianza: {predictionResult.prediction} ({predictionResult.percentage}%)
                  </span>
                ) : (
                  <span style={{ color: '#FF9800' }}>
                    ⚠️ Baja confianza: {predictionResult.prediction} ({predictionResult.percentage}%)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingIntegrated;