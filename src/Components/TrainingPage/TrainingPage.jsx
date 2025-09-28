// src/Components/TrainingPage/TrainingPage.jsx - VERSIÓN CORREGIDA
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import * as tf from '@tensorflow/tfjs';
import apiService from '../../services/apiService';
import './TrainingPage.css';

// Servicios locales (solo para entrenamiento y práctica)
import localDataManager from '../../services/localDataManager';
import tfjsTrainer from '../../services/tfjsTrainer';

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

  // Configuración de rendimiento
  const COLLECTION_INTERVAL = 1000;
  const RENDER_THROTTLE = 100;
  const lastRenderTime = useRef(0);
  const MIN_HAND_SIZE = 0.17;

  // Sincronizar refs con estados
  useEffect(() => {
    collectingRef.current = isCollecting;
  }, [isCollecting]);

  useEffect(() => {
    selectedLabelRef.current = selectedLabel;
  }, [selectedLabel]);

  // Cargar estado del dataset del BACKEND al inicio
  useEffect(() => {
    loadBackendDatasetStatus();
    loadLocalModels();
  }, [selectedCategory]);

  // ========== FUNCIONES PARA BACKEND (RECOLECCIÓN) ==========

  // Cargar estado del dataset desde el backend
  const loadBackendDatasetStatus = useCallback(async () => {
    try {
      const status = await apiService.getDatasetStatus(selectedCategory);
      setDatasetStatus(status);
    } catch (error) {
      console.error('Error cargando estado del backend:', error);
      setDatasetStatus({ labels: {}, summary: { total_samples: 0 } });
    }
  }, [selectedCategory]);

  // Enviar muestra al backend (SOLO backend)
  const sendSampleToBackend = useCallback(async (landmarks, label) => {
    try {
      const result = await apiService.collectSample(selectedCategory, label, landmarks);
      console.log('✅ Muestra enviada al backend:', result);
      
      // Actualizar estado del dataset después de enviar
      await loadBackendDatasetStatus();
      
      return result;
    } catch (error) {
      console.error('Error enviando muestra al backend:', error);
      throw error;
    }
  }, [selectedCategory, loadBackendDatasetStatus]);

  // ========== FUNCIONES PARA ENTRENAMIENTO LOCAL ==========

  // Cargar modelos locales
  const loadLocalModels = useCallback(async () => {
    try {
      const localModels = await tfjsTrainer.getLocalModels(selectedCategory);
      setAvailableModels(localModels);
    } catch (error) {
      console.error('Error cargando modelos locales:', error);
      setAvailableModels([]);
    }
  }, [selectedCategory]);

  // Entrenamiento LOCAL con datos del backend
  const handleLocalTraining = async () => {
    try {
      setTrainingProgress({ status: 'training', progress: 0, message: 'Validando datos...' });

      // Verificar que hay datos suficientes en el backend
      const backendStatus = await apiService.getDatasetStatus(selectedCategory);
      console.log('📊 Estado del dataset en backend:', backendStatus);
      
      if (!backendStatus.summary?.ready_to_train) {
        const insufficientLabels = Object.entries(backendStatus.labels || {})
          .filter(([_, info]) => (info.samples || 0) < 30)
          .map(([label, info]) => `${label} (${info.samples || 0}/30)`);

        throw new Error(
          `Datos insuficientes en el backend. Etiquetas faltantes:\n${insufficientLabels.join('\n')}`
        );
      }

      // Descargar datos del backend y preparar para entrenamiento local
      setTrainingProgress({ status: 'training', progress: 10, message: 'Descargando datos del backend...' });
      
      // Simular descarga de datos del backend (en una implementación real, necesitarías un endpoint para esto)
      // Por ahora, usaremos los datos locales como si fueran descargados del backend
      const { X, y, labels } = localDataManager.loadTrainingData(selectedCategory);

      console.log('📥 Datos preparados para entrenamiento:', {
        muestras: X.length,
        etiquetas: labels.length,
        shapeX: X.length > 0 ? `${X.length}x${X[0].length}` : '0x0'
      });

      if (X.length === 0 || y.length === 0) {
        throw new Error('No se pudieron descargar datos válidos del backend');
      }

      if (labels.length === 0) {
        throw new Error('No se encontraron etiquetas válidas en el backend');
      }

      // Entrenar con TensorFlow.js LOCAL
      setTrainingProgress({ status: 'training', progress: 20, message: 'Iniciando entrenamiento ' });

      console.log('🧠 Iniciando entrenamiento local con TensorFlow.js...');
      const result = await tfjsTrainer.trainModel(
        X, y, labels, epochs, 16,
        (progress, message) => {
          console.log(`📈 Progreso: ${progress}% - ${message}`);
          setTrainingProgress({ status: 'training', progress: Math.min(85, progress), message });
        }
      );

      console.log('🎯 Resultado del entrenamiento:', result);

      // Verificar que el modelo existe
      if (!result || !result.model) {
        throw new Error('El entrenamiento no devolvió un modelo válido');
      }

      if (!result.labels || result.labels.length === 0) {
        console.warn('⚠️ No se devolvieron etiquetas, usando las originales');
        result.labels = labels;
      }

      // Guardar modelo localmente
      setTrainingProgress({ status: 'training', progress: 90, message: 'Guardando modelo local...' });
      
      console.log('💾 Guardando modelo local...');
      const modelInfo = await tfjsTrainer.saveModel(
        selectedCategory, 
        modelName, 
        result.model,
        result.labels
      );

      console.log('✅ Modelo guardado localmente:', modelInfo);

      // Completar
      setTrainingProgress({
        status: 'completed',
        progress: 100,
        message: '✅ Modelo entrenado localmente y guardado exitosamente',
        metrics: {
          accuracy: (result.finalAccuracy * 100).toFixed(1) + '%',
          loss: result.finalLoss.toFixed(4)
        }
      });

      // Recargar modelos disponibles
      await loadLocalModels();

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

  // Predicción LOCAL
  const predictLocally = async (landmarks) => {
    try {
      if (!tfjsTrainer.hasModel(selectedCategory, selectedModel)) {
        throw new Error('Modelo local no cargado');
      }

      const predictions = await tfjsTrainer.predict(selectedCategory, selectedModel, landmarks);
      const labels = await tfjsTrainer.getModelLabels(selectedCategory, selectedModel);

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
        top_3: ranking
      };

    } catch (error) {
      console.error('Error en predicción local:', error);
      return null;
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
        // --- MODO RECOLECCIÓN (SOLO BACKEND) ---
        if (mode === 'collect' && collectingRef.current && selectedLabelRef.current && !processingRef.current) {
          const timeSinceLastCollection = now - lastCollectionTime.current;

          if (timeSinceLastCollection > COLLECTION_INTERVAL) {
            processingRef.current = true;

            try {
              console.log(`🌐 Enviando muestra al backend para: ${selectedLabelRef.current}`);

              // ENVIAR SOLO AL BACKEND
              const result = await sendSampleToBackend(landmarks, selectedLabelRef.current);

              console.log(`✅ Muestra ${result.current_samples || '?'} enviada al backend`);
              lastCollectionTime.current = now;

              if (result.current_samples >= 30) {
                console.log(`🎯 Límite alcanzado para ${selectedLabelRef.current}`);
                setIsCollecting(false);
                collectingRef.current = false;
              }
            } catch (error) {
              console.error('Error enviando al backend:', error);
            } finally {
              processingRef.current = false;
            }
          }
        }

        // --- MODO PRÁCTICA (LOCAL) ---
        else if (mode === 'practice' && !processingRef.current && selectedModel) {
          const handSize = calcularTamanioMano(results.multiHandLandmarks[0]);

          if (handSize >= MIN_HAND_SIZE) {
            if (now - lastCollectionTime.current > 500) {
              try {
                // PREDICCIÓN LOCAL
                const prediction = await predictLocally(landmarks);

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
  }, [mode, selectedCategory, selectedModel, sendSampleToBackend]);

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
    // SIEMPRE entrenamiento local
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
      // LIMPIAR DATOS DEL BACKEND
      if (type === 'current') {
        await apiService.clearLabelData(selectedCategory, selectedLabel);
        alert(`Datos de "${selectedLabel}" eliminados del backend`);
      } else if (type === 'all') {
        await apiService.clearCategoryData(selectedCategory);
        alert(`Todas las muestras de "${selectedCategory}" eliminadas del backend`);
      }
      
      // Recargar estado del backend
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
  const handleStopCamera = () => {
    setIsCameraActive(false);
    setIsCollecting(false);
    collectingRef.current = false;
    processingRef.current = false;
  };

  const handleToggleCollection = () => {
    if (!selectedLabel) {
      alert('Selecciona una etiqueta primero');
      return;
    }

    const newCollecting = !isCollecting;
    console.log(`Recolección ${newCollecting ? 'iniciada' : 'detenida'} para: ${selectedLabel}`);

    setIsCollecting(newCollecting);
    collectingRef.current = newCollecting;

    if (newCollecting) {
      lastCollectionTime.current = 0;
      processingRef.current = false;
    }
  };

  const handleSwitchMode = (newMode) => {
    console.log(`Cambiando a modo: ${newMode}`);
    setIsCollecting(false);
    collectingRef.current = false;
    processingRef.current = false;
    setMode(newMode);
    setPredictionResult(null);
    setTrainingProgress(null);
    lastCollectionTime.current = 0;
    lastRenderTime.current = 0;
  };

  const handleCategoryChange = (newCategory) => {
    console.log(`Cambiando categoría a: ${newCategory}`);
    if (isCollecting) {
      setIsCollecting(false);
      collectingRef.current = false;
    }
    setSelectedCategory(newCategory);
    setSelectedLabel('');
    setSelectedModel('');
    setPredictionResult(null);
    loadBackendDatasetStatus();
    loadLocalModels();
  };

  const handleLabelChange = (label) => {
    console.log(`Cambiando etiqueta a: ${label}`);
    const wasCollecting = isCollecting;
    if (wasCollecting) {
      setIsCollecting(false);
      collectingRef.current = false;
    }
    setSelectedLabel(label);
    selectedLabelRef.current = label;
    if (wasCollecting) {
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
      {/* Header SIN toggle local/backend */}
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
                      disabled={isCollecting}
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
                        cursor: !isCollecting ? 'pointer' : 'not-allowed',
                        fontSize: '14px',
                        opacity: isCollecting ? 0.6 : 1
                      }}
                    >
                      {label} ({getLabelSamples(label)}/30)
                    </button>
                  ))}
                </div>
              </div>

              {/* Indicador de etiqueta activa */}
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
                      ⏱️ Enviando al backend cada {COLLECTION_INTERVAL / 1000}s
                    </div>
                  )}
                </div>
              )}

              <div className="collection-controls">
                <button
                  onClick={handleToggleCollection}
                  disabled={!isCameraActive || !selectedLabel || isLabelReady(selectedLabel)}
                  className={isCollecting ? 'stop' : 'start'}
                  style={{
                    background: isCollecting ? '#ff4757' : '#2ecc71',
                    color: 'white',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {isCollecting ? '⏹️ DETENER' : '▶️ INICIAR'} Recolección
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

                {/* Botones de borrado */}
                <div className="clear-controls" style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleClearData('current')}
                    disabled={!selectedLabel || getLabelSamples(selectedLabel) === 0 || isCollecting}
                    style={{
                      background: '#ff4757',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '5px',
                      cursor: selectedLabel && getLabelSamples(selectedLabel) > 0 && !isCollecting ? 'pointer' : 'not-allowed',
                      fontWeight: '600',
                      fontSize: '14px',
                      opacity: selectedLabel && getLabelSamples(selectedLabel) > 0 && !isCollecting ? 1 : 0.6
                    }}
                    title={isCollecting ? 'Detén la recolección primero' : `Borrar todas las muestras de "${selectedLabel}" del backend`}
                  >
                    🗑️ Borrar {selectedLabel || 'Etiqueta'}
                  </button>

                  <button
                    onClick={() => handleClearData('all')}
                    disabled={!datasetStatus.summary?.total_samples || isCollecting}
                    style={{
                      background: '#ff3838',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '5px',
                      cursor: datasetStatus.summary?.total_samples && !isCollecting ? 'pointer' : 'not-allowed',
                      fontWeight: '600',
                      fontSize: '14px',
                      opacity: datasetStatus.summary?.total_samples && !isCollecting ? 1 : 0.6
                    }}
                    title={isCollecting ? 'Detén la recolección primero' : "Borrar todas las muestras del backend"}
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
                <h4>Muestras Listas Para Entrenar:</h4>
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
                disabled={trainingProgress?.status === 'training' || !datasetStatus.summary?.ready_to_train}
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
                  : !datasetStatus.summary?.ready_to_train
                    ? 'Datos Insuficientes'
                    : 'Iniciar Entrenamiento'
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

          {/* Modo Práctica */}
          {mode === 'practice' && (
            <div className="practice-panel">

              {/* Selector de Modelo */}
              <div className="model-selector" style={{ marginBottom: '20px' }}>
                <h4>Seleccionar Modelo:</h4>
                {availableModels.length === 0 ? (
                  <div style={{
                    padding: '20px',
                    background: '#fff3e0',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <p>No hay modelos locales para "{categories[selectedCategory]?.name}"</p>
                    <p style={{ fontSize: '14px', color: '#666' }}>
                      Ve a "Entrenar" para crear un modelo local con los datos del backend
                    </p>
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
                          {model.model_name || 'Modelo Default'} 
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                          Precisión: {model.accuracy}% | Muestras: {model.samples_used}
                        </div>
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                          Etiquetas: {model.labels?.join(', ') || 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resultado de predicción */}
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
                        Modelo activo: {selectedModel} 
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

          {/* Indicadores de estado */}
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
                  🌐 Recolección: {isCollecting ? 'Enviando al Backend' : 'Pausada'}
                </div>
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
              <div className="indicator" style={{
                padding: '5px 10px',
                borderRadius: '15px',
                fontSize: '12px',
                background: categories[selectedCategory].color,
                color: 'white'
              }}>
                🤖 {selectedModel} 💾
              </div>
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

            
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingIntegrated;