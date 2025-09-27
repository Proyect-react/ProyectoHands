import React, { useEffect, useRef, useState, useCallback } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

const API_BASE_URL = "http://127.0.0.1:8000"; // Tu backend

// ======= PLACEHOLDERS TEMPORALES =======
const evaluateHand = (handLandmarks, character) => {
  // Devuelve precisión simulada (100%) por ahora
  return { accuracy: 100 };
};

const drawHand = (ctx, handLandmarks, canvas) => {
  // Dibujar los landmarks (vacío temporal)
  // Puedes agregar tu lógica de dibujo aquí
};
// =======================================

function DeteccionVocales({ character = "A", onPrecisionUpdate, mode = "practice" }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const handsRef = useRef(null);
  
  const [accuracy, setAccuracy] = useState(0);
  const [isCollectingData, setIsCollectingData] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [modelTrained, setModelTrained] = useState(false);

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

  // Predicción en tiempo real con modelo entrenado
  const predictWithModel = useCallback(async (landmarks) => {
    try {
      const response = await fetch(`${API_BASE_URL}/predict/vocales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(landmarks)
      });

      const result = await response.json();
      
      if (response.ok) {
        return {
          prediction: result.prediction,
          confidence: result.confidence,
          percentage: result.percentage
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error en predicción:', error);
      return null;
    }
  }, []);

  // Callback principal de MediaPipe
  const onResults = useCallback(async (results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

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
          
        } else if (mode === "practice" && modelTrained) {
          // Modo práctica: usar modelo entrenado
          const prediction = await predictWithModel(landmarksArray);
          
          if (prediction) {
            setAccuracy(prediction.percentage);
            onPrecisionUpdate?.(prediction.percentage);
          }
        }
      }
      
      // Dibujar la mano
      drawHand(ctx, results.multiHandLandmarks[0], canvas);
    }
  }, [mode, isCollectingData, character, sampleCount, modelTrained, sendSampleToBackend, predictWithModel, onPrecisionUpdate]);

  // ======= Inicialización de MediaPipe y cámara =======
  useEffect(() => {
    if (!videoRef.current) return;

    handsRef.current = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsRef.current.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7
    });

    handsRef.current.onResults(onResults);

    cameraRef.current = new Camera(videoRef.current, {
      onFrame: async () => {
        await handsRef.current.send({ image: videoRef.current });
      },
      width: 900,
      height: 500
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

      {/* Canvas para mostrar la cámara */}
      <canvas ref={canvasRef} width="900" height="500" />
      
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
