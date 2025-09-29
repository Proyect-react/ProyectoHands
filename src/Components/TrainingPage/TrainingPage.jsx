// src/Components/TrainingPage/TrainingPage.jsx - VERSIÓN CON DESCARGA AUTOMÁTICA
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import * as tf from '@tensorflow/tfjs';
import apiService from '../../services/apiService';
import './TrainingPage.css';

// 🆕 NUEVO SERVICIO DE DESCARGA
import modelDownloadService from '../../services/modelDownloadService';
// Servicios locales (solo para entrenamiento)
import localDataManager from '../../services/localDataManager';
import tfjsTrainer from '../../services/tfjsTrainer';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

const TrainingIntegrated = () => {
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
      // Obtener modelos descargados para la categoría actual
      const downloadedModels = modelDownloadService.getDownloadedModels(selectedCategory);

      console.log(`📋 Modelos descargados para ${selectedCategory}:`, downloadedModels);

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

  const uploadModelAlternativeSimple = async (model, category, modelName) => {
    try {
      console.log("🔄 Usando método alternativo simple...");

      const response = await fetch(`${API_BASE_URL}/train/upload-model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: category,
          model_name: modelName,
          upload_type: 'metadata_only',
          timestamp: new Date().toISOString(),
          message: 'Modelo entrenado en frontend'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log("✅ Metadata enviada al backend:", result);

      return {
        success: true,
        message: 'Modelo registrado en backend (solo metadata)',
        result: result
      };

    } catch (error) {
      console.error("❌ Error en método alternativo simple:", error);
      throw error;
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

  // Callback principal de MediaPipe
  const onResults = useCallback(async (results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const now = Date.now();
    const shouldRender = now - lastRenderTime.current > RENDER_THROTTLE;

    if (shouldRender) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      lastRenderTime.current = now;
    }

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = extractLandmarksArray(results.multiHandLandmarks);

      if (shouldRender) {
        drawHand(canvas.getContext("2d"), results.multiHandLandmarks[0], canvas);
      }

      if (landmarks) {
        // MODO RECOLECCIÓN (BUFFER LOCAL → BACKEND)
        if (mode === 'collect' && collectingRef.current && selectedLabelRef.current && !processingRef.current) {
          const currentSamples = getLabelSamples(selectedLabelRef.current);
          if (currentSamples >= 30) {
            setIsCollecting(false);
            collectingRef.current = false;
            processingRef.current = false;
            return;
          }

          const timeSinceLastCollection = now - lastCollectionTime.current;

          if (timeSinceLastCollection > COLLECTION_INTERVAL) {
            processingRef.current = true;

            try {
              addToBuffer(landmarks, selectedLabelRef.current);
              lastCollectionTime.current = now;
            } catch (error) {
              console.error('Error agregando al buffer:', error);
            } finally {
              processingRef.current = false;
            }
          }
        }

        // 🆕 MODO PRÁCTICA (LOCAL Y DESCARGADO)
        else if (mode === 'practice' && !processingRef.current && selectedModel) {
          const handSize = calcularTamanioMano(results.multiHandLandmarks[0]);

          if (handSize >= MIN_HAND_SIZE) {
            if (now - lastCollectionTime.current > 500) {
              try {
                // 🆕 USAR NUEVA FUNCIÓN DE PREDICCIÓN
                const prediction = await predictWithDownloadedModel(landmarks);

                if (prediction) {
                  setPredictionResult(prediction);
                  lastCollectionTime.current = now;
                }
              } catch (error) {
                console.error('Error en predicción:', error);
                setPredictionResult(null);
              }
            }
          } else {
            setPredictionResult({
              prediction: "Acerca tu mano a la cámara",
              percentage: 0,
              high_confidence: false,
              top_3: []
            });
          }
        }
      }
    } else if (mode === 'practice') {
      setPredictionResult(null);
    }
  }, [mode, selectedCategory, selectedModel, addToBuffer, predictWithDownloadedModel]);

  const drawHand = (ctx, landmarks, canvas) => {
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17]
    ];

    ctx.strokeStyle = "rgba(0,255,0,0.6)";
    ctx.lineWidth = 2;

    for (const [start, end] of connections) {
      const startPoint = landmarks[start];
      const endPoint = landmarks[end];

      ctx.beginPath();
      ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
      ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
      ctx.stroke();
    }

    ctx.fillStyle = "red";
    for (const landmark of landmarks) {
      ctx.beginPath();
      ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  // Inicialización de MediaPipe
  useEffect(() => {
    if (!isCameraActive) {
      processingRef.current = false;
      lastCollectionTime.current = 0;
      lastRenderTime.current = 0;
      return;
    }

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.8,
      minTrackingConfidence: 0.8
    });

    hands.onResults(onResults);
    handsRef.current = hands;

    const videoElement = videoRef.current;
    if (videoElement) {
      const camera = new Camera(videoElement, {
        onFrame: async () => {
          if (videoElement && hands) {
            try {
              await hands.send({ image: videoElement });
            } catch (error) {
              console.error('Error enviando frame:', error);
            }
          }
        },
        width: 640,
        height: 480
      });

      cameraRef.current = camera;
      camera.start();
    }

    return () => {
      if (cameraRef.current) {
        try {
          cameraRef.current.stop?.();
        } catch (error) {
          console.warn('Error deteniendo cámara:', error);
        }
      }
      if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (error) {
            console.warn('Error deteniendo track:', error);
          }
        });
      }
      if (handsRef.current) {
        handsRef.current.onResults(() => { });
      }
    };
  }, [isCameraActive, onResults]);

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
  const handleStartCamera = () => setIsCameraActive(true);
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
                      className={`label-btn ${selectedLabel === label ? 'selected' : ''} ${isLabelReady(label) ? 'complete' : ''}`}
                      onClick={() => handleLabelChange(label)}
                      disabled={isCollecting || bufferStatus.sending}
                      style={{
                        background: selectedLabel === label
                          ? categories[selectedCategory].color
                          : isLabelReady(label)
                            ? '#4CAF50'
                            : '#f0f0f0',
                        color: selectedLabel === label || isLabelReady(label) ? 'white' : '#333',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontWeight: '600',
                        cursor: !isCollecting && !bufferStatus.sending ? 'pointer' : 'not-allowed',
                        fontSize: '14px',
                        opacity: isCollecting || bufferStatus.sending ? 0.6 : 1
                      }}
                    >
                      {label} ({getLabelSamples(label)}/30)
                    </button>
                  ))}
                </div>
              </div>

              {selectedLabel && (
                <div className="active-label-indicator" style={{
                  background: isCollecting ? '#4CAF50' : '#f0f0f0',
                  color: isCollecting ? 'white' : '#333',
                  padding: '10px',
                  borderRadius: '8px',
                  margin: '10px 0',
                  textAlign: 'center',
                  fontWeight: 'bold'
                }}>
                  🎯 Recolectando: {selectedLabel} ({categories[selectedCategory]?.name})
                  {isCollecting && (
                    <div style={{ fontSize: '12px', marginTop: '5px' }}>
                      📦 Acumula en buffer → Envío cada 10 muestras
                    </div>
                  )}
                </div>
              )}

              <div className="collection-controls">
                <button
                  onClick={handleToggleCollection}
                  disabled={!isCameraActive || !selectedLabel || isLabelReady(selectedLabel) || bufferStatus.sending}
                  className={isCollecting ? 'stop' : 'start'}
                  style={{
                    background: isCollecting ? '#ff4757' : bufferStatus.sending ? '#ccc' : '#2ecc71',
                    color: 'white',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {bufferStatus.sending
                    ? '⏳ ENVIANDO...'
                    : isCollecting
                      ? '⏹️ DETENER'
                      : '▶️ INICIAR'} Recolección
                </button>

                {selectedLabel && (
                  <div className="progress-info">
                    <p>Progreso para '{selectedLabel}': {getLabelSamples(selectedLabel)}/30</p>
                    <div className="progress-bar" style={{ background: '#e0e0e0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        className="progress-fill"
                        style={{
                          width: `${(getLabelSamples(selectedLabel) / 30) * 100}%`,
                          height: '100%',
                          background: categories[selectedCategory].color,
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="clear-controls" style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleClearData('current')}
                    disabled={!selectedLabel || getLabelSamples(selectedLabel) === 0 || isCollecting || bufferStatus.sending}
                    style={{
                      background: '#ff4757',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '5px',
                      cursor: selectedLabel && getLabelSamples(selectedLabel) > 0 && !isCollecting && !bufferStatus.sending ? 'pointer' : 'not-allowed',
                      fontWeight: '600',
                      fontSize: '14px',
                      opacity: selectedLabel && getLabelSamples(selectedLabel) > 0 && !isCollecting && !bufferStatus.sending ? 1 : 0.6
                    }}
                    title={isCollecting || bufferStatus.sending ? 'Detén la recolección primero' : `Borrar todas las muestras de "${selectedLabel}" del backend`}
                  >
                    🗑️ Borrar {selectedLabel || 'Etiqueta'}
                  </button>

                  <button
                    onClick={() => handleClearData('all')}
                    disabled={!datasetStatus.summary?.total_samples || isCollecting || bufferStatus.sending}
                    style={{
                      background: '#ff3838',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '5px',
                      cursor: datasetStatus.summary?.total_samples && !isCollecting && !bufferStatus.sending ? 'pointer' : 'not-allowed',
                      fontWeight: '600',
                      fontSize: '14px',
                      opacity: datasetStatus.summary?.total_samples && !isCollecting && !bufferStatus.sending ? 1 : 0.6
                    }}
                    title={isCollecting || bufferStatus.sending ? 'Detén la recolección primero' : "Borrar todas las muestras del backend"}
                  >
                    💀 Borrar Todo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modo Entrenamiento */}
          {mode === 'train' && (
            <div className="train-panel">

              <div className="dataset-summary">
                <h4>Estado del Dataset (Backend):</h4>
                {getCurrentLabels().map(label => (
                  <div key={label} className="label-status" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '5px 10px',
                    background: isLabelReady(label) ? '#e8f5e8' : '#fff3e0',
                    borderRadius: '4px',
                    margin: '4px 0'
                  }}>
                    <span>{label}: {getLabelSamples(label)}/30</span>
                    <span className={isLabelReady(label) ? 'ready' : 'pending'}>
                      {isLabelReady(label) ? '✅' : '⏳'}
                    </span>
                  </div>
                ))}

                <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                  Total en backend: {datasetStatus.summary?.total_samples || 0} muestras
                </div>
              </div>

              <div className="training-form" style={{ margin: '20px 0' }}>
                <div className="form-group">
                  <label htmlFor="modelName">Nombre del Modelo:</label>
                  <input
                    type="text"
                    id="modelName"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder={`modelo_${selectedCategory}`}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ddd',
                      marginTop: '5px'
                    }}
                  />
                </div>

                <div className="form-group" style={{ marginTop: '15px' }}>
                  <label htmlFor="epochs">Número de Épocas:</label>
                  <input
                    type="number"
                    id="epochs"
                    min="10"
                    max="200"
                    value={epochs}
                    onChange={(e) => setEpochs(parseInt(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ddd',
                      marginTop: '5px'
                    }}
                  />
                </div>
              </div>

              <button
                onClick={handleStartTraining}
                disabled={trainingProgress?.status === 'training'}
                className="train-button"
                style={{
                  background: trainingProgress?.status === 'training' || !datasetStatus.summary?.ready_to_train
                    ? '#ccc'
                    : categories[selectedCategory].color,
                  color: 'white',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                {trainingProgress?.status === 'training'
                  ? 'Entrenando Localmente...'
                  : 'Iniciar Entrenamiento Local'
                }
              </button>

              {trainingProgress && (
                <div className="training-progress" style={{ marginTop: '20px' }}>
                  <h4>Progreso: {trainingProgress.status}</h4>
                  <p>{trainingProgress.message}</p>
                  <div className="progress-bar" style={{ background: '#e0e0e0', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${trainingProgress.progress}%`,
                        height: '100%',
                        background: categories[selectedCategory].color,
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                  <p>{trainingProgress.progress}%</p>

                  {trainingProgress.metrics && (
                    <div className="metrics" style={{
                      background: '#f5f5f5',
                      padding: '10px',
                      borderRadius: '8px',
                      marginTop: '10px'
                    }}>
                      <p>Precisión: {trainingProgress.metrics.accuracy}</p>
                      <p>Pérdida: {trainingProgress.metrics.loss}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 🆕 Modo Práctica ACTUALIZADO */}
          {mode === 'practice' && (
            <div className="practice-panel">

              {/* Selector de Modelo MEJORADO */}
              <div className="model-selector" style={{ marginBottom: '20px' }}>
                <h4>Seleccionar Modelo:</h4>
                {availableModels.length === 0 ? (
                  <div style={{
                    padding: '20px',
                    background: '#fff3e0',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <p>No hay modelos disponibles para "{categories[selectedCategory]?.name}"</p>
                    <p style={{ fontSize: '14px', color: '#666' }}>
                      Los modelos se descargan automáticamente del backend o puedes crear uno en "Entrenar"
                    </p>
                    {/* 🆕 Botón de recarga manual */}
                    <button
                      onClick={() => checkAndDownloadModels(selectedCategory)}
                      style={{
                        background: '#2196F3',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        marginTop: '10px'
                      }}
                    >
                      🔄 Verificar Modelos
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {availableModels.map((model, index) => (
                      <div
                        key={model.model_name || index}
                        className={`model-option ${selectedModel === (model.model_name || 'default') ? 'selected' : ''}`}
                        onClick={() => setSelectedModel(model.model_name || 'default')}
                        style={{
                          padding: '12px',
                          border: `2px solid ${selectedModel === (model.model_name || 'default') ? categories[selectedCategory].color : '#e0e0e0'}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: selectedModel === (model.model_name || 'default') ? `${categories[selectedCategory].color}20` : '#fff'
                        }}
                      >
                        <div style={{ fontWeight: 'bold' }}>
                          {model.model_name || 'Modelo Default'} {model.source === 'downloaded' ? '📥' : '💾'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                          Precisión: {model.accuracy}% | Muestras: {model.samples_used} |
                          Fuente: {model.source === 'downloaded' ? 'Backend' : 'Local'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                          Etiquetas: {model.labels?.join(', ') || 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resultado de predicción ACTUALIZADO */}
              {selectedModel && (
                <>
                  {predictionResult ? (
                    <div className="prediction-result" style={{
                      padding: '15px',
                      background: '#f8f9fa',
                      borderRadius: '10px',
                      border: `2px solid ${categories[selectedCategory].color}40`
                    }}>
                      <h4 style={{ color: categories[selectedCategory].color }}>
                        {predictionResult.prediction === "Acerca tu mano a la cámara"
                          ? "Acerca tu mano a la cámara"
                          : `Predicción: ${predictionResult.prediction}`}
                      </h4>
                      <p>
                        {predictionResult.prediction === "Acerca tu mano a la cámara"
                          ? "La mano está demasiado lejos o no es visible"
                          : `Confianza: ${predictionResult.percentage}%`}
                      </p>

                      {/* 🆕 INDICADOR DE FUENTE DEL MODELO */}
                      {predictionResult.model_source && predictionResult.prediction !== "Acerca tu mano a la cámara" && (
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
                          Modelo: {predictionResult.model_source === 'downloaded' ? '📥 Descargado del backend' : '💾 Entrenado localmente'}
                        </div>
                      )}

                      {predictionResult.prediction !== "Acerca tu mano a la cámara" && (
                        <div className="confidence-bar" style={{
                          background: '#e0e0e0',
                          height: '10px',
                          borderRadius: '5px',
                          overflow: 'hidden'
                        }}>
                          <div
                            className="confidence-fill"
                            style={{
                              width: `${predictionResult.percentage}%`,
                              height: '100%',
                              background: predictionResult.high_confidence ? '#4CAF50' : '#FF9800',
                              transition: 'width 0.3s ease'
                            }}
                          />
                        </div>
                      )}

                      {predictionResult.top_3 && predictionResult.top_3.length > 0 && predictionResult.prediction !== "Acerca tu mano a la cámara" && (
                        <div className="top-predictions" style={{ marginTop: '15px' }}>
                          <h5>Top 3 Predicciones:</h5>
                          {predictionResult.top_3.map((pred, i) => (
                            <div key={i} className="prediction-item" style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '5px 0',
                              borderBottom: i < predictionResult.top_3.length - 1 ? '1px solid #eee' : 'none'
                            }}>
                              <span style={{ fontWeight: i === 0 ? 'bold' : 'normal' }}>
                                {i + 1}. {pred.label}
                              </span>
                              <span style={{ color: '#666' }}>
                                {pred.percentage}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      padding: '40px',
                      textAlign: 'center',
                      background: '#f8f9fa',
                      borderRadius: '10px',
                      border: '2px dashed #ddd'
                    }}>
                      <p>Muestra tu mano para obtener una predicción</p>
                      <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                        Modelo activo: {selectedModel} {availableModels.find(m => m.model_name === selectedModel)?.source === 'downloaded' ? '📥' : '💾'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Panel derecho - Cámara */}
        <div className="camera-panel">
          <div className="camera-controls">
            <button
              onClick={handleStartCamera}
              disabled={isCameraActive}
              style={{
                background: isCameraActive ? '#ccc' : '#4CAF50',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: isCameraActive ? 'not-allowed' : 'pointer'
              }}
            >
              📷 Iniciar Cámara
            </button>
            <button
              onClick={handleStopCamera}
              disabled={!isCameraActive}
              style={{
                background: !isCameraActive ? '#ccc' : '#f44336',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: !isCameraActive ? 'not-allowed' : 'pointer',
                marginLeft: '10px'
              }}
            >
              ⏹️ Detener Cámara
            </button>
          </div>

          <div className="camera-feed">
            <video ref={videoRef} style={{ display: 'none' }} width="640" height="480" autoPlay playsInline />
            <canvas
              ref={canvasRef}
              width="640"
              height="480"
              style={{
                width: '100%',
                maxWidth: '600px',
                height: 'auto',
                border: `2px solid ${categories[selectedCategory].color}`,
                borderRadius: '8px'
              }}
            />
          </div>

          {/* Indicadores de estado ACTUALIZADOS */}
          <div className="status-indicators" style={{
            display: 'flex',
            gap: '10px',
            marginTop: '10px',
            flexWrap: 'wrap'
          }}>
            <div className={`indicator ${isCameraActive ? 'active' : ''}`} style={{
              padding: '5px 10px',
              borderRadius: '15px',
              fontSize: '12px',
              background: isCameraActive ? '#4CAF50' : '#ccc',
              color: 'white'
            }}>
              📷 Cámara: {isCameraActive ? 'Activa' : 'Inactiva'}
            </div>

            {mode === 'collect' && (
              <>
                <div className={`indicator ${isCollecting ? 'active' : ''}`} style={{
                  padding: '5px 10px',
                  borderRadius: '15px',
                  fontSize: '12px',
                  background: isCollecting ? '#FF9800' : '#ccc',
                  color: 'white'
                }}>
                  📦 Buffer: {isCollecting ? `${bufferStatus.count}/10` : 'Pausado'}
                </div>

                {bufferStatus.sending && (
                  <div className="indicator" style={{
                    padding: '5px 10px',
                    borderRadius: '15px',
                    fontSize: '12px',
                    background: '#FF5722',
                    color: 'white'
                  }}>
                    🚀 Enviando al Backend
                  </div>
                )}

                {selectedLabel && (
                  <div className="indicator" style={{
                    padding: '5px 10px',
                    borderRadius: '15px',
                    fontSize: '12px',
                    background: categories[selectedCategory].color,
                    color: 'white'
                  }}>
                    🏷️ {selectedLabel}
                  </div>
                )}
              </>
            )}

            {mode === 'practice' && selectedModel && (
              <>
                <div className="indicator" style={{
                  padding: '5px 10px',
                  borderRadius: '15px',
                  fontSize: '12px',
                  background: categories[selectedCategory].color,
                  color: 'white'
                }}>
                  🤖 {selectedModel}
                </div>

                {/* 🆕 INDICADOR DE FUENTE DEL MODELO */}
                <div className="indicator" style={{
                  padding: '5px 10px',
                  borderRadius: '15px',
                  fontSize: '12px',
                  background: availableModels.find(m => m.model_name === selectedModel)?.source === 'downloaded' ? '#2196F3' : '#9C27B0',
                  color: 'white'
                }}>
                  {availableModels.find(m => m.model_name === selectedModel)?.source === 'downloaded' ? '📥 Backend' : '💾 Local'}
                </div>
              </>
            )}

            <div className="indicator" style={{
              padding: '5px 10px',
              borderRadius: '15px',
              fontSize: '12px',
              background: categories[selectedCategory].color,
              color: 'white'
            }}>
              📂 {categories[selectedCategory].name}
            </div>

            {/* 🆕 INDICADOR DE ESTADO DE DESCARGA */}
            {(downloadStatus.checking || downloadStatus.downloading || downloadStatus.downloadedModels.length > 0) && (
              <div className="indicator" style={{
                padding: '5px 10px',
                borderRadius: '15px',
                fontSize: '12px',
                background: downloadStatus.checking || downloadStatus.downloading ? '#FF9800' : '#4CAF50',
                color: 'white'
              }}>
                {downloadStatus.checking ? '🔍 Verificando...' :
                  downloadStatus.downloading ? '⬇️ Descargando...' :
                    `📥 ${downloadStatus.downloadedModels.length} modelos`}
              </div>
            )}

            {/* Indicador del flujo actualizado */}
            <div className="indicator" style={{
              padding: '5px 10px',
              borderRadius: '15px',
              fontSize: '12px',
              background: '#6c5ce7',
              color: 'white'
            }}>
              {mode === 'collect' && '📦→🌐 Buffer→Backend'}
              {mode === 'train' && '🌐→💻→☁️→📥 Backend→Local→Cloud→Auto'}
              {mode === 'practice' && '📥🤖 Auto-Download+Local'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingIntegrated;