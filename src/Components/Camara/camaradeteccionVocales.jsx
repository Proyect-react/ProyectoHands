import React, { useEffect, useRef, useState, useCallback } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

const API_BASE_URL = "http://127.0.0.1:8000"; // Tu backend

// ======= OPTIMIZACIONES DE RENDIMIENTO =======
const RENDER_THROTTLE = 200; // Aumentado para reducir lag
const PREDICTION_THROTTLE = 500; // Throttling para predicciones
const CONFIDENCE_THRESHOLD = 0.8; // Umbral alto para precisión

// Función optimizada para evaluar mano
const evaluateHand = (handLandmarks, character) => {
  // Devuelve precisión simulada (100%) por ahora
  return { accuracy: 100 };
};

// Función optimizada para dibujar mano
const drawHand = (ctx, handLandmarks, canvas) => {
  if (!handLandmarks || handLandmarks.length === 0) return;
  
  // Conexiones optimizadas
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17]
  ];

  // Dibujar conexiones
  ctx.strokeStyle = "rgba(0,255,0,0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  for (const [start, end] of connections) {
    const startPoint = handLandmarks[start];
    const endPoint = handLandmarks[end];
    if (startPoint && endPoint) {
      ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
      ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
    }
  }
  ctx.stroke();

  // Dibujar puntos
  ctx.fillStyle = "red";
  for (const landmark of handLandmarks) {
    ctx.beginPath();
    ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
};
// =======================================

function DeteccionVocales({ character = "A", onPrecisionUpdate, mode = "practice", selectedModel = null }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const handsRef = useRef(null);
  
  const [accuracy, setAccuracy] = useState(0);
  const [isCollectingData, setIsCollectingData] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [modelTrained, setModelTrained] = useState(false);
  
  // Referencias para optimización de rendimiento
  const lastRenderTime = useRef(0);
  const lastPredictionTime = useRef(0);
  const isProcessing = useRef(false);
  const predictionQueue = useRef([]);

  // Función para extraer landmarks limpios
  const extractLandmarksArray = (landmarks) => {
    if (!landmarks || landmarks.length === 0) return null;
    
    const landmarksArray = [];
    
    // Procesar hasta 2 manos
    for (let i = 0; i < Math.min(2, landmarks.length); i++) {
      for (const landmark of landmarks[i]) {
        landmarksArray.push(landmark.x, landmark.y, landmark.z);
      }
    }
    
    // Si solo hay 1 mano, rellenar con ceros para la segunda
    if (landmarks.length === 1) {
      for (let i = 0; i < 63; i++) { // 21 landmarks * 3 coordenadas
        landmarksArray.push(0.0);
      }
    }
    
    return landmarksArray.length === 126 ? landmarksArray : null;
  };

  // Enviar muestra al backend
  const sendSampleToBackend = useCallback(async (landmarks, label) => {
    try {
      const response = await fetch(`${API_BASE_URL}/collect/sample`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: "vocales",
          label: label,
          landmarks: landmarks
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        setSampleCount(result.current_samples);
        console.log(`✅ Muestra ${result.current_samples}/30 enviada`);
        return true;
      } else {
        console.error('Error enviando muestra:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Error de red:', error);
      return false;
    }
  }, []);

  // Predicción optimizada con modelo específico
  const predictWithModel = useCallback(async (landmarks) => {
    if (isProcessing.current) return null;
    
    isProcessing.current = true;
    
    try {
      const requestBody = {
        landmarks,
        confidence_threshold: CONFIDENCE_THRESHOLD,
        model_name: selectedModel || null
      };

      const response = await fetch(`${API_BASE_URL}/predict/vocales/practice/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        // Solo devolver la precisión de la letra/número seleccionada
        const isCorrectPrediction = result.prediction === character;
        const targetAccuracy = isCorrectPrediction ? result.percentage : 0;
        
        return {
          prediction: result.prediction,
          confidence: result.confidence,
          percentage: targetAccuracy, // Solo precisión de la letra seleccionada
          isCorrect: isCorrectPrediction,
          character: character
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error en predicción:', error);
      return null;
    } finally {
      isProcessing.current = false;
    }
  }, [character, selectedModel]);

  // Callback principal optimizado de MediaPipe
  const onResults = useCallback(async (results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const now = Date.now();
    
    // Throttling para renderizado
    if (now - lastRenderTime.current < RENDER_THROTTLE) {
      return;
    }
    
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    lastRenderTime.current = now;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarksArray = extractLandmarksArray(results.multiHandLandmarks);
      
      if (landmarksArray) {
        if (mode === "training" && isCollectingData) {
          // Modo entrenamiento: recolectar datos
          const precision = evaluateHand(results.multiHandLandmarks[0], character);
          
          if (precision.accuracy >= 85) { // Solo enviar si es buena la posición
            const success = await sendSampleToBackend(landmarksArray, character);
            if (success && sampleCount >= 29) { // 30 muestras completas
              setIsCollectingData(false);
            }
          }
          
          setAccuracy(precision.accuracy);
          
        } else if (mode === "practice" && selectedModel) {
          // Modo práctica: usar modelo entrenado con throttling
          if (now - lastPredictionTime.current > PREDICTION_THROTTLE && !isProcessing.current) {
            lastPredictionTime.current = now;
            
            // Hacer predicción de forma asíncrona sin bloquear el render
            setTimeout(async () => {
              const prediction = await predictWithModel(landmarksArray);
              
              if (prediction) {
                setAccuracy(prediction.percentage);
                onPrecisionUpdate?.(prediction.percentage);
              }
            }, 0);
          }
        }
      }
      
      // Dibujar la mano de forma optimizada
      drawHand(ctx, results.multiHandLandmarks[0], canvas);
    } else if (mode === "practice") {
      // Si no hay mano detectada, resetear precisión
      setAccuracy(0);
      onPrecisionUpdate?.(0);
    }
  }, [mode, isCollectingData, character, sampleCount, selectedModel, sendSampleToBackend, predictWithModel, onPrecisionUpdate]);

  // ======= Inicialización de MediaPipe y cámara =======
  useEffect(() => {
    if (!videoRef.current) return;

    handsRef.current = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsRef.current.setOptions({
      maxNumHands: 1, // Reducido para mejor rendimiento
      modelComplexity: 0, // Modelo más ligero
      minDetectionConfidence: 0.6, // Reducido para menos procesamiento
      minTrackingConfidence: 0.6 // Reducido para menos procesamiento
    });

    handsRef.current.onResults(onResults);

    cameraRef.current = new Camera(videoRef.current, {
      onFrame: async () => {
        if (handsRef.current && videoRef.current) {
          try {
            await handsRef.current.send({ image: videoRef.current });
          } catch (error) {
            console.warn('Error enviando frame a MediaPipe:', error);
          }
        }
      },
      width: 640, // Reducido para mejor rendimiento
      height: 480
    });

    cameraRef.current.start();

    return () => {
      cameraRef.current?.stop();
      handsRef.current?.close();
    };
  }, [onResults]);

  // ======= JSX =======
  return (
    <div className="camera-detection-container">
      {/* Video oculto */}
      <video ref={videoRef} style={{ display: 'none' }} />

      {/* Canvas optimizado para mostrar la cámara */}
      <canvas 
        ref={canvasRef} 
        width="640" 
        height="480"
        style={{
          borderRadius: "20px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          background: "#000",
          width: "100%",
          height: "auto",
          maxWidth: "100%",
          display: "block"
        }}
      />
      
      {/* Controles según el modo */}
      {mode === "training" && (
        <div className="training-controls">
          <button 
            onClick={() => setIsCollectingData(!isCollectingData)}
            disabled={sampleCount >= 30}
          >
            {isCollectingData ? 'Detener Recolección' : 'Iniciar Recolección'}
          </button>
          <p>Muestras: {sampleCount}/30</p>
        </div>
      )}
      
      {/* Mostrar precisión */}
      <div className="accuracy-display">
        <p>Precisión: {accuracy.toFixed(1)}%</p>
      </div>
    </div>
  );
}

// Exportación nombrada para evitar el error de importación
export { DeteccionVocales };
export default DeteccionVocales;
