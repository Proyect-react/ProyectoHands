// src/Components/TrainingIntegrated/TrainingIntegrated.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import APIService from '../../services/apiService';
import './TrainingPage.css';

// 🗑️ FUNCIONES PARA BORRAR DATOS
const clearCategoryData = async (category) => {
  try {
    const response = await fetch(`http://127.0.0.1:8000/collect/clear/${category}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    console.log('✅ Datos eliminados:', result.message);
    return result;
  } catch (error) {
    console.error('❌ Error eliminando datos:', error);
    throw error;
  }
};

const clearLabelData = async (category, label) => {
  try {
    const response = await fetch(`http://127.0.0.1:8000/collect/clear/${category}?label=${label}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    console.log('✅ Etiqueta eliminada:', result.message);
    return result;
  } catch (error) {
    console.error('❌ Error eliminando etiqueta:', error);
    throw error;
  }
};

const TrainingIntegrated = ({ category = "vocales" }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);

  // Estados principales
  const [mode, setMode] = useState('collect');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [modelName, setModelName] = useState("modelo_default");
  const [epochs, setEpochs] = useState(20);

  
  // Estados de datos
  const [datasetStatus, setDatasetStatus] = useState({});
  const [trainingProgress, setTrainingProgress] = useState(null);
  const [predictionResult, setPredictionResult] = useState(null);
  const vocales = ['A', 'E', 'I', 'O', 'U'];
  const numeros = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const operaciones = ['+', "-", "*", "/",]
  const [availableLabels] = useState([...vocales, ...numeros, ...operaciones]);
  

  // 🔧 REFERENCIAS PARA CONTROL DE ESTADO
  const collectingRef = useRef(false);
  const selectedLabelRef = useRef('');
  const lastCollectionTime = useRef(0);
  const processingRef = useRef(false);
  
  // 🎯 CONFIGURACIÓN DE RENDIMIENTO
  const COLLECTION_INTERVAL = 1000; // 2 segundos entre muestras
  const RENDER_THROTTLE = 100; // Limitar renders a cada 100ms
  const lastRenderTime = useRef(0);

  // Sincronizar refs con estados
  useEffect(() => {
    collectingRef.current = isCollecting;
  }, [isCollecting]);

  useEffect(() => {
    selectedLabelRef.current = selectedLabel;
  }, [selectedLabel]);

  // Cargar estado del dataset al inicio
  useEffect(() => {
    loadDatasetStatus();
  }, [category]);

  // Polling para progreso de entrenamiento (optimizado)
  useEffect(() => {
    let interval;
    if (mode === 'train' && trainingProgress?.status === 'training') {
      interval = setInterval(async () => {
        try {
          const progress = await APIService.getTrainingProgress(category);
          setTrainingProgress(progress);
          
          if (progress.status === 'completed' || progress.status === 'error') {
            clearInterval(interval);
          }
        } catch (error) {
          console.error('Error verificando progreso:', error);
        }
      }, 3000); // Aumentado a 3 segundos para reducir carga
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [mode, trainingProgress?.status, category]);

  const loadDatasetStatus = async () => {
    try {
      const status = await APIService.getDatasetStatus(category);
      setDatasetStatus(status);
    } catch (error) {
      console.error('Error cargando estado:', error);
    }
  };

  // 🗑️ FUNCIÓN PARA BORRAR DATOS (mejorada)
  const handleClearData = async (type = 'current') => {
    if (type === 'current' && !selectedLabel) {
      alert('⚠️ Selecciona una etiqueta primero');
      return;
    }

    // Detener recolección durante limpieza
    const wasCollecting = isCollecting;
    if (wasCollecting) {
      setIsCollecting(false);
      collectingRef.current = false;
    }

    let confirmMessage = '';
    
    if (type === 'current') {
      const currentSamples = getLabelSamples(selectedLabel);
      confirmMessage = `¿Eliminar todas las muestras de "${selectedLabel}"?\n\nSe eliminarán ${currentSamples} muestras.\n\nEsta acción NO se puede deshacer.`;
    } else if (type === 'all') {
      const totalSamples = Object.values(datasetStatus.labels || {}).reduce((sum, label) => sum + (label.samples || 0), 0);
      confirmMessage = `¿Eliminar TODAS las muestras de la categoría "${category}"?\n\nSe eliminarán ${totalSamples} muestras de todas las etiquetas.\n\nEsta acción NO se puede deshacer.`;
    }

    const userConfirmed = window.confirm(`⚠️ CONFIRMACIÓN\n\n${confirmMessage}`);
    if (!userConfirmed) {
      // Restaurar estado de recolección si se cancela
      if (wasCollecting) {
        setIsCollecting(true);
        collectingRef.current = true;
      }
      return;
    }

    try {
      if (type === 'current') {
        await clearLabelData(category, selectedLabel);
        alert(`✅ Datos de "${selectedLabel}" eliminados correctamente`);
      } else if (type === 'all') {
        await clearCategoryData(category);
        alert(`✅ Todas las muestras de "${category}" eliminadas correctamente`);
      }

      // Recargar estado del dataset
      await loadDatasetStatus();
      
    } catch (error) {
      alert(`❌ Error eliminando datos: ${error.message}`);
      console.error('Error eliminando:', error);
      
      // Restaurar estado de recolección en caso de error
      if (wasCollecting) {
        setIsCollecting(true);
        collectingRef.current = true;
      }
    }
  };

  const extractLandmarksArray = (multiHandLandmarks) => {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) return null;
    
    const landmarks = [];
    
    // Procesar hasta 2 manos
    for (let i = 0; i < Math.min(2, multiHandLandmarks.length); i++) {
      for (const landmark of multiHandLandmarks[i]) {
        landmarks.push(landmark.x, landmark.y, landmark.z);
      }
    }
    
    // Rellenar con ceros si solo hay 1 mano
    if (multiHandLandmarks.length === 1) {
      for (let i = 0; i < 63; i++) {
        landmarks.push(0.0);
      }
    }
    
    return landmarks.length === 126 ? landmarks : null;
  };

  // 🚀 OPTIMIZACIÓN DEL CALLBACK PRINCIPAL
  const onResults = useCallback(async (results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 🎭 THROTTLING DE RENDER PARA MEJOR PERFORMANCE
    const now = Date.now();
    const shouldRender = now - lastRenderTime.current > RENDER_THROTTLE;
    
    if (shouldRender) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      lastRenderTime.current = now;
    }

    // 🖐️ PROCESAMIENTO DE MANOS
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = extractLandmarksArray(results.multiHandLandmarks);
      
      if (landmarks) {
        // 📊 MODO RECOLECCIÓN (con protecciones mejoradas)
        if (mode === 'collect' && collectingRef.current && selectedLabelRef.current && !processingRef.current) {
          const timeSinceLastCollection = now - lastCollectionTime.current;
          
          if (timeSinceLastCollection > COLLECTION_INTERVAL) {
            processingRef.current = true; // Bloquear procesamiento concurrente
            
            try {
              console.log(`📝 Recolectando para etiqueta: ${selectedLabelRef.current}`);
              
              const result = await APIService.collectSample(
                category, 
                selectedLabelRef.current, // Usar ref para evitar stale closures
                landmarks,
                {
                  collection_mode: 'automatic',
                  hand_count: results.multiHandLandmarks.length,
                  timestamp: new Date().toISOString()
                }
              );
              
              if (result.success) {
                console.log(`✅ Muestra ${result.current_samples} guardada para ${selectedLabelRef.current}`);
                await loadDatasetStatus();
                lastCollectionTime.current = now;
                
                // Parar automáticamente si se alcanza el límite
                if (result.current_samples >= 30) {
                  console.log(`🏁 Límite alcanzado para ${selectedLabelRef.current}`);
                  setIsCollecting(false);
                  collectingRef.current = false;
                }
              }
            } catch (error) {
              console.error('❌ Error recolectando:', error);
            } finally {
              processingRef.current = false; // Liberar bloqueo
            }
          }
        }
        
        // 🎯 MODO PRÁCTICA CON PREDICCIÓN
        else if (mode === 'practice' && !processingRef.current) {
          // Throttling para predicciones también
          if (now - lastCollectionTime.current > 500) { // Predicción cada 500ms
            try {
              const prediction = await APIService.predict(category, landmarks, {
                threshold: 0.6,
                returnAll: false
              });
              
              setPredictionResult(prediction);
              lastCollectionTime.current = now;
            } catch (error) {
              console.error('Error en predicción:', error);
              setPredictionResult(null);
            }
          }
        }
      }

      // 🖌️ DIBUJAR LA MANO (solo si es tiempo de render)
      if (shouldRender) {
        drawHand(canvas.getContext("2d"), results.multiHandLandmarks[0], canvas);
      }
    } else {
      if (mode === 'practice') {
        setPredictionResult(null);
      }
    }
  }, [mode, category]); // Dependencias mínimas para evitar recreaciones

  const drawHand = (ctx, landmarks, canvas) => {
    // Dibujar conexiones
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

    // Dibujar puntos
    ctx.fillStyle = "red";
    for (const landmark of landmarks) {
      ctx.beginPath();
      ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  // 🎥 INICIALIZACIÓN DE MEDIAPIPE (optimizada)
  useEffect(() => {
    if (!isCameraActive) {
      // Limpiar estados cuando se desactiva la cámara
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
        width: 640,  // Reducido para mejor performance
        height: 480  // Reducido para mejor performance
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
        handsRef.current.onResults(() => {}); // Limpiar callback
      }
    };
  }, [isCameraActive, onResults]);

  // Handlers principales
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
    console.log(`🔄 Cambiando recolección a: ${newCollecting} para etiqueta: ${selectedLabel}`);
    
    setIsCollecting(newCollecting);
    collectingRef.current = newCollecting;
    
    if (newCollecting) {
      // Reset timers al iniciar recolección
      lastCollectionTime.current = 0;
      processingRef.current = false;
    }
  };

  const handleStartTraining = async (name, epochs) => {
    try {
      setMode('train');
      const result = await APIService.startTraining(category, { name, epochs });
      setTrainingProgress({ status: 'training', progress: 0, message: 'Iniciando...' });
    } catch (error) {
      console.error('Error iniciando entrenamiento:', error);
      alert('Error iniciando entrenamiento');
    }
  };
  

  const handleSwitchMode = (newMode) => {
    console.log(`🔄 Cambiando modo de ${mode} a ${newMode}`);
    
    // Detener recolección al cambiar modo
    setIsCollecting(false);
    collectingRef.current = false;
    processingRef.current = false;
    
    setMode(newMode);
    setPredictionResult(null);
    setTrainingProgress(null);
    
    // Reset timers
    lastCollectionTime.current = 0;
    lastRenderTime.current = 0;
  };

  // 🏷️ CAMBIO DE ETIQUETA CON PROTECCIÓN
  const handleLabelChange = (label) => {
    console.log(`🏷️ Cambiando etiqueta de ${selectedLabel} a ${label}`);
    
    // Detener recolección temporalmente
    const wasCollecting = isCollecting;
    if (wasCollecting) {
      setIsCollecting(false);
      collectingRef.current = false;
    }
    
    // Cambiar etiqueta
    setSelectedLabel(label);
    selectedLabelRef.current = label;
    
    // Restaurar recolección si estaba activa (después de un pequeño delay)
    if (wasCollecting) {
      setTimeout(() => {
        setIsCollecting(true);
        collectingRef.current = true;
        lastCollectionTime.current = 0; // Reset timer
      }, 500); // Medio segundo de pausa
    }
  };

  const getLabelSamples = (label) => {
    return datasetStatus.labels?.[label]?.samples || 0;
  };

  const isLabelReady = (label) => {
    return getLabelSamples(label) >= 30;
  };

  const allLabelsReady = () => {
    return availableLabels.every(label => isLabelReady(label));
  };
  

  return (
    <div className="training-integrated">
      {/* Header con controles de modo */}
      <div className="training-header">
        <h1>Entrenamiento Integrado - {category}</h1>
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
        {/* Panel izquierdo - Estado y controles */}
        <div className="control-panel">
          {/* Modo Recolección */}
          {mode === 'collect' && (
            <div className="collect-panel">
              <h3>📊 Recolección de Datos</h3>
              
              <div className="label-selector">
                <h4>Seleccionar Etiqueta:</h4>
                {availableLabels.map(label => (
                  <button
                    key={label}
                    className={`label-btn ${selectedLabel === label ? 'selected' : ''} ${isLabelReady(label) ? 'complete' : ''}`}
                    onClick={() => handleLabelChange(label)}
                    disabled={isCollecting} // Deshabilitar cambio durante recolección
                  >
                    {label} ({getLabelSamples(label)}/30)
                  </button>
                ))}
              </div>

              {/* ⚠️ INDICADOR DE ETIQUETA ACTIVA */}
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
                  🎯 Recolectando para: {selectedLabel}
                  {isCollecting && (
                    <div style={{ fontSize: '12px', marginTop: '5px' }}>
                      ⏱️ Siguiente muestra en {Math.max(0, Math.ceil((COLLECTION_INTERVAL - (Date.now() - lastCollectionTime.current)) / 1000))}s
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
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{width: `${(getLabelSamples(selectedLabel) / 30) * 100}%`}}
                      />
                    </div>
                  </div>
                )}

                {/* 🗑️ BOTONES DE BORRADO */}
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
                    title={isCollecting ? 'Detén la recolección primero' : `Borrar todas las muestras de "${selectedLabel}"`}
                  >
                    🗑️ Borrar {selectedLabel || 'Etiqueta'}
                  </button>

                  <button
                    onClick={() => handleClearData('all')}
                    disabled={Object.values(datasetStatus.labels || {}).every(label => (label.samples || 0) === 0) || isCollecting}
                    style={{
                      background: '#ff3838',
                      color: 'white',
                      border: 'none',
                      padding: '10px 15px',
                      borderRadius: '5px',
                      cursor: Object.values(datasetStatus.labels || {}).some(label => (label.samples || 0) > 0) && !isCollecting ? 'pointer' : 'not-allowed',
                      fontWeight: '600',
                      fontSize: '14px',
                      opacity: Object.values(datasetStatus.labels || {}).some(label => (label.samples || 0) > 0) && !isCollecting ? 1 : 0.6
                    }}
                    title={isCollecting ? 'Detén la recolección primero' : "Borrar todas las muestras de todas las etiquetas"}
                  >
                    💀 Borrar Todo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Resto de modos... (igual que antes) */}
          {mode === 'train' && (
            <div className="train-panel">
              <h3>🧠 Entrenamiento del Modelo</h3>
              
              <div className="dataset-summary">
                <h4>Estado del Dataset:</h4>
                {availableLabels.map(label => (
                  <div key={label} className="label-status">
                    <span>{label}: {getLabelSamples(label)}/30</span>
                    <span className={isLabelReady(label) ? 'ready' : 'pending'}>
                      {isLabelReady(label) ? '✅' : '⏳'}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={handleStartTraining}
                disabled={trainingProgress?.status === 'training'}
                className="train-button"
              >
                {trainingProgress?.status === 'training' ? 'Entrenando...' : 'Iniciar Entrenamiento'}
              </button>

              {trainingProgress && (
                <div className="training-progress">
                  <h4>Progreso: {trainingProgress.status}</h4>
                  <p>{trainingProgress.message}</p>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{width: `${trainingProgress.progress}%`}}
                    />
                  </div>
                  <p>{trainingProgress.progress}%</p>
                  
                  {trainingProgress.metrics && (
                    <div className="metrics">
                      <p>Precisión: {(trainingProgress.metrics.accuracy * 100).toFixed(2)}%</p>
                      <p>F1-Score: {trainingProgress.metrics.f1_score?.toFixed(3)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === 'practice' && (
            <div className="practice-panel">
              <h3>🎯 Práctica con IA</h3>
              
              {predictionResult ? (
                <div className="prediction-result">
                  <h4>Predicción: {predictionResult.prediction}</h4>
                  <p>Confianza: {predictionResult.percentage}%</p>
                  <div className="confidence-bar">
                    <div 
                      className="confidence-fill" 
                      style={{
                        width: `${predictionResult.percentage}%`,
                        backgroundColor: predictionResult.high_confidence ? '#4CAF50' : '#FF9800'
                      }}
                    />
                  </div>
                  
                  {predictionResult.top_3 && (
                    <div className="top-predictions">
                      <h5>Top 3:</h5>
                      {predictionResult.top_3.map((pred, i) => (
                        <div key={i} className="prediction-item">
                          <span>{pred.label}: {pred.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p>Muestra tu mano para obtener una predicción</p>
              )}
            </div>
          )}
        </div>

        {/* Panel derecho - Cámara o Entrenamiento */}
<div className="camera-panel">
  {/* Si estamos en modo entrenamiento, mostrar formulario en vez de cámara */}
  {mode === 'train' ? (
    <div className="training-form">
      <h3>⚙️ Configuración de Entrenamiento</h3>
      
      <div className="form-group">
        <label htmlFor="modelName">Nombre del Modelo:</label>
        <input 
          type="text" 
          id="modelName" 
          value={modelName} 
          onChange={(e) => setModelName(e.target.value)} 
          placeholder="Ej: modelo_vocales"
        />
      </div>

      <div className="form-group">
        <label htmlFor="epochs">Número de Épocas:</label>
        <input 
          type="number" 
          id="epochs" 
          min="1" 
          max="200" 
          value={epochs} 
          onChange={(e) => setEpochs(parseInt(e.target.value))}
        />
      </div>

      <button 
        onClick={() => handleStartTraining(modelName, epochs)} 
        disabled={trainingProgress?.status === 'training'}
      >
        {trainingProgress?.status === 'training' ? '⏳ Entrenando...' : '🚀 Entrenar Modelo'}
      </button>

      {/* Mostrar progreso */}
      {trainingProgress && (
        <div className="training-progress">
          <h4>Progreso: {trainingProgress.status}</h4>
          <p>{trainingProgress.message}</p>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{width: `${trainingProgress.progress}%`}}
            />
          </div>
          <p>{trainingProgress.progress}%</p>
        </div>
      )}
    </div>
  ) : (
    <>
      {/* Panel normal de cámara */}
      <div className="camera-controls">
        <button onClick={handleStartCamera} disabled={isCameraActive}>
          📷 Iniciar Cámara
        </button>
        <button onClick={handleStopCamera} disabled={!isCameraActive}>
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
            border: '2px solid #ddd',
            borderRadius: '8px'
          }}
        />
      </div>
    </>
  )}
</div>


          {/* Indicadores de estado mejorados */}
          <div className="status-indicators">
            <div className={`indicator ${isCameraActive ? 'active' : ''}`}>
              📷 Cámara: {isCameraActive ? 'Activa' : 'Inactiva'}
            </div>
            {mode === 'collect' && (
              <>
                <div className={`indicator ${isCollecting ? 'active' : ''}`}>
                  📊 Recolección: {isCollecting ? 'Activa' : 'Pausada'}
                </div>
                {selectedLabel && (
                  <div className="indicator">
                    🏷️ Etiqueta: {selectedLabel}
                  </div>
                )}
                {processingRef.current && (
                  <div className="indicator active">
                    ⚡ Procesando muestra...
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
  );
};

export default TrainingIntegrated;