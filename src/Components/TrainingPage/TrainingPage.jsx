// src/Components/TrainingIntegrated/TrainingIntegrated.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import APIService from '../../services/apiService';
import './TrainingPage.css';

const TrainingIntegrated = ({ category = "vocales" }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);

  // Estados principales
  const [mode, setMode] = useState('collect'); // collect, train, practice
  const [selectedLabel, setSelectedLabel] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  // Estados de datos
  const [datasetStatus, setDatasetStatus] = useState({});
  const [trainingProgress, setTrainingProgress] = useState(null);
  const [predictionResult, setPredictionResult] = useState(null);
  const [availableLabels] = useState(['A', 'E', 'I', 'O', 'U']);

  // Referencias para callbacks
  const collectingRef = useRef(false);
  const lastCollectionTime = useRef(0);

  // Cargar estado del dataset al inicio
  useEffect(() => {
    loadDatasetStatus();
  }, [category]);

  // Polling para progreso de entrenamiento
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
      }, 2000);
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

  const onResults = useCallback(async (results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = extractLandmarksArray(results.multiHandLandmarks);
      
      if (landmarks) {
        // Modo recolección
        if (mode === 'collect' && collectingRef.current && selectedLabel) {
          const now = Date.now();
          if (now - lastCollectionTime.current > 1000) { // Límite de 1 muestra por segundo
            try {
              const result = await APIService.collectSample(
                category, 
                selectedLabel, 
                landmarks,
                {
                  collection_mode: 'automatic',
                  hand_count: results.multiHandLandmarks.length
                }
              );
              
              if (result.success) {
                await loadDatasetStatus();
                lastCollectionTime.current = now;
                
                // Parar automáticamente si se alcanza el límite
                if (result.current_samples >= 30) {
                  setIsCollecting(false);
                  collectingRef.current = false;
                }
              }
            } catch (error) {
              console.error('Error recolectando:', error);
            }
          }
        }
        
        // Modo práctica con predicción
        else if (mode === 'practice') {
          try {
            const prediction = await APIService.predict(category, landmarks, {
              threshold: 0.6,
              returnAll: false
            });
            
            setPredictionResult(prediction);
          } catch (error) {
            console.error('Error en predicción:', error);
            setPredictionResult(null);
          }
        }
      }

      // Dibujar la mano
      drawHand(ctx, results.multiHandLandmarks[0], canvas);
    } else {
      setPredictionResult(null);
    }
  }, [mode, selectedLabel, category]);

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

  // Inicialización de MediaPipe
  useEffect(() => {
    if (!isCameraActive) return;

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
          if (videoElement) {
            await hands.send({ image: videoElement });
          }
        },
        width: 900,
        height: 500
      });
      
      cameraRef.current = camera;
      camera.start();
    }

    return () => {
      if (cameraRef.current) cameraRef.current.stop?.();
      if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraActive, onResults]);

  // Handlers principales
  const handleStartCamera = () => setIsCameraActive(true);
  const handleStopCamera = () => {
    setIsCameraActive(false);
    setIsCollecting(false);
    collectingRef.current = false;
  };

  const handleToggleCollection = () => {
    if (!selectedLabel) {
      alert('Selecciona una etiqueta primero');
      return;
    }
    
    const newCollecting = !isCollecting;
    setIsCollecting(newCollecting);
    collectingRef.current = newCollecting;
  };

  const handleStartTraining = async () => {
    try {
      setMode('train');
      const result = await APIService.startTraining(category);
      setTrainingProgress({ status: 'training', progress: 0, message: 'Iniciando...' });
    } catch (error) {
      console.error('Error iniciando entrenamiento:', error);
      alert('Error iniciando entrenamiento');
    }
  };

  const handleSwitchMode = (newMode) => {
    setMode(newMode);
    setIsCollecting(false);
    collectingRef.current = false;
    setPredictionResult(null);
    setTrainingProgress(null);
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
            disabled={!allLabelsReady()}
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
                    onClick={() => setSelectedLabel(label)}
                  >
                    {label} ({getLabelSamples(label)}/30)
                  </button>
                ))}
              </div>

              <div className="collection-controls">
                <button
                  onClick={handleToggleCollection}
                  disabled={!isCameraActive || !selectedLabel || isLabelReady(selectedLabel)}
                  className={isCollecting ? 'stop' : 'start'}
                >
                  {isCollecting ? '⏸️ Detener' : '▶️ Iniciar'} Recolección
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
              </div>
            </div>
          )}

          {/* Modo Entrenamiento */}
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
                disabled={!allLabelsReady() || trainingProgress?.status === 'training'}
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

          {/* Modo Práctica */}
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

        {/* Panel derecho - Cámara */}
        <div className="camera-panel">
          <div className="camera-controls">
            <button onClick={handleStartCamera} disabled={isCameraActive}>
              📷 Iniciar Cámara
            </button>
            <button onClick={handleStopCamera} disabled={!isCameraActive}>
              ⏹️ Detener Cámara
            </button>
          </div>

          <div className="camera-feed">
            <video ref={videoRef} style={{ display: 'none' }} width="900" height="500" autoPlay playsInline />
            <canvas 
              ref={canvasRef} 
              width="900" 
              height="500" 
              style={{
                width: '100%',
                maxWidth: '600px',
                height: 'auto',
                border: '2px solid #ddd',
                borderRadius: '8px'
              }}
            />
          </div>

          {/* Indicadores de estado */}
          <div className="status-indicators">
            <div className={`indicator ${isCameraActive ? 'active' : ''}`}>
              📷 Cámara: {isCameraActive ? 'Activa' : 'Inactiva'}
            </div>
            {mode === 'collect' && (
              <div className={`indicator ${isCollecting ? 'active' : ''}`}>
                📊 Recolección: {isCollecting ? 'Activa' : 'Pausada'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingIntegrated;