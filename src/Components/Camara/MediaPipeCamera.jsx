// src/Components/TrainingPage/MediaPipeCamera.jsx - VERSIÓN CORREGIDA
import React, { useEffect, useRef, useState } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
];

const MediaPipeCamera = ({ onHandDetected, isActive, categoryColor = '#4CAF50', width = 640, height = 480 }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);

  const extractLandmarksArray = (multiHandLandmarks) => {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) return null;

    const landmarks = [];
    for (const landmark of multiHandLandmarks[0]) {
      landmarks.push(landmark.x, landmark.y, landmark.z);
    }

    for (let i = 0; i < 63; i++) {
      landmarks.push(0.0);
    }

    return landmarks.length === 126 ? landmarks : null;
  };

  // 🆕 FUNCIÓN PARA DETENER CÁMARA COMPLETAMENTE
  const stopCameraCompletely = async () => {
    try {
      if (cameraRef.current) {
        await cameraRef.current.stop();
        cameraRef.current = null;
      }
      
      // Limpiar el elemento video
      const videoElement = videoRef.current;
      if (videoElement) {
        videoElement.srcObject = null;
        const tracks = videoElement.srcObject?.getTracks() || [];
        tracks.forEach(track => track.stop());
      }
      
    } catch (error) {
      console.warn('Error deteniendo cámara:', error);
    }
  };

  // 🆕 FUNCIÓN PARA INICIAR CÁMARA
  const startCamera = async () => {
    try {
      setIsReady(false);

      // Primero detener cualquier cámara existente
      await stopCameraCompletely();

      const videoElement = videoRef.current;
      const canvas = canvasRef.current;

      if (!videoElement || !canvas) {
        throw new Error('Elementos de video o canvas no encontrados');
      }

      // Configurar dimensiones del canvas
      canvas.width = width;
      canvas.height = height;

      // Limpiar canvas
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.fillText('Iniciando cámara...', 10, 30);
      }

      // Inicializar Hands si no existe
      if (!handsRef.current) {

        const hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.5,
          selfieMode: false
        });

        hands.onResults((results) => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Dibujar imagen de la cámara
          ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            
            // Dibujar conexiones
            ctx.strokeStyle = "rgba(0,255,0,0.6)";
            ctx.lineWidth = 2;
            for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
              const start = landmarks[startIdx];
              const end = landmarks[endIdx];
              if (start && end) {
                ctx.beginPath();
                ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
                ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
                ctx.stroke();
              }
            }
            
            // Dibujar puntos
            ctx.fillStyle = categoryColor || "red";
            for (const landmark of landmarks) {
              ctx.beginPath();
              ctx.arc(
                landmark.x * canvas.width,
                landmark.y * canvas.height,
                5,
                0,
                2 * Math.PI
              );
              ctx.fill();
            }

            if (onHandDetected) {
              const landmarksArray = extractLandmarksArray(results.multiHandLandmarks);
              if (landmarksArray) {
                onHandDetected(landmarksArray, results.multiHandLandmarks[0]);
              }
            }
          } else {
            // Mostrar mensaje cuando no hay manos
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillRect(10, 10, 220, 30);
            ctx.fillStyle = '#333';
            ctx.font = '14px Arial';
            ctx.fillText('Muestra tu mano a la cámara', 15, 30);
          }

          ctx.restore();
        });

        await hands.initialize();
        handsRef.current = hands;
      }

      // Crear nueva instancia de cámara
      const camera = new Camera(videoElement, {
        onFrame: async () => {
          if (handsRef.current && videoElement.readyState === 4) {
            try {
              await handsRef.current.send({ image: videoElement });
            } catch (error) {
              console.warn('Error enviando frame a MediaPipe:', error);
            }
          }
        },
        width: width,
        height: height,
        facingMode: 'user'
      });

      await camera.start();
      cameraRef.current = camera;

      console.log('✅ Cámara iniciada exitosamente');
      setIsReady(true);

    } catch (error) {
      console.error('❌ Error iniciando cámara:', error);
      setIsReady(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      startCamera();
    } else {
      stopCameraCompletely();
      setIsReady(false);
    }

    // Cleanup al desmontar el componente
    return () => {
      stopCameraCompletely();
    };
  }, [isActive]);

  if (!isActive) {
    return (
      <div style={{ 
        width: '100%', 
        maxWidth: '600px',
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `2px solid ${categoryColor}`,
        borderRadius: '8px',
        background: '#f5f5f5'
      }}>
        <p style={{ color: '#666', fontSize: '16px' }}>📹 Cámara desactivada</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '600px', position: 'relative' }}>
      <video
        ref={videoRef}
        style={{ display: "none" }}
        width={width}
        height={height}
        autoPlay
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: '100%',
          height: 'auto',
          border: `2px solid ${categoryColor}`,
          borderRadius: '8px',
          display: 'block',
          background: '#000'
        }}
      />
      {!isReady && isActive && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '10px 15px',
          borderRadius: '5px',
          fontSize: '14px'
        }}>
          🔄 Iniciando cámara...
        </div>
      )}
    </div>
  );
};

export default MediaPipeCamera;