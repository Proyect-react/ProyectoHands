// src/Components/TrainingPage/MediaPipeCamera.jsx - FIX RÁPIDO
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

// Variables globales
let globalHandsInstance = null;
let globalCameraInstance = null;
let isInitializing = false;
// 🔥 NUEVA: Variable para callback actual
let currentOnHandDetected = null;

const MediaPipeCamera = ({ onHandDetected, isActive, categoryColor = '#4CAF50' }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  // 🔥 ACTUALIZAR callback global cada vez que cambie
  useEffect(() => {
    currentOnHandDetected = onHandDetected;
  }, [onHandDetected]);

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

  useEffect(() => {
    if (!isActive) {
      setIsReady(false);
      
      // Detener cámara pero mantener MediaPipe
      if (globalCameraInstance) {
        try {
          globalCameraInstance.stop();
        } catch (e) {
          console.warn('Error deteniendo cámara:', e);
        }
      }
      
      return;
    }

    const videoElement = videoRef.current;
    const canvas = canvasRef.current;

    if (!videoElement || !canvas) return;

    // 🔥 FIX PRINCIPAL: Si existe MediaPipe, recrear la cámara
    if (globalHandsInstance && globalCameraInstance) {
      console.log('♻️ Recreando cámara con MediaPipe existente...');
      
      // 🔥 RECREAR LA CÁMARA (no solo restart)
      const recreateCamera = async () => {
        try {
          // Detener cámara anterior
          await globalCameraInstance.stop();
          
          // Crear nueva cámara
          const newCamera = new Camera(videoElement, {
            onFrame: async () => {
              if (globalHandsInstance && videoElement.readyState === 4) {
                try {
                  await globalHandsInstance.send({ image: videoElement });
                } catch (error) {
                  // Ignorar errores menores
                }
              }
            },
            width: 640,
            height: 480,
            facingMode: 'user'
          });

          await newCamera.start();
          globalCameraInstance = newCamera;
          
          console.log('✅ Cámara recreada exitosamente');
          setIsReady(true);
          
        } catch (error) {
          console.error('Error recreando cámara:', error);
          // Si falla, reinicializar todo
          globalHandsInstance = null;
          globalCameraInstance = null;
          setIsReady(false);
        }
      };
      
      recreateCamera();
      return;
    }

    // Evitar múltiples inicializaciones
    if (isInitializing) {
      console.log('⏳ Ya inicializando...');
      return;
    }

    isInitializing = true;

    // 🔥 Callback que usa la función actual
    const onResults = (results) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
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

        // 🔥 USAR CALLBACK ACTUAL (no el del closure)
        if (currentOnHandDetected) {
          const landmarksArray = extractLandmarksArray(results.multiHandLandmarks);
          if (landmarksArray) {
            currentOnHandDetected(landmarksArray, results.multiHandLandmarks[0]);
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
    };

    const initMediaPipe = async () => {
      try {
        console.log('🆕 Inicializando MediaPipe...');

        const hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.5,
          selfieMode: true
        });

        hands.onResults(onResults);
        await hands.initialize();
        globalHandsInstance = hands;

        const camera = new Camera(videoElement, {
          onFrame: async () => {
            if (globalHandsInstance && videoElement.readyState === 4) {
              try {
                await globalHandsInstance.send({ image: videoElement });
              } catch (error) {
                // Ignorar errores menores
              }
            }
          },
          width: 640,
          height: 480,
          facingMode: 'user'
        });

        await camera.start();
        globalCameraInstance = camera;

        console.log('✅ MediaPipe inicializado');
        setIsReady(true);

      } catch (error) {
        console.error('❌ Error:', error);
        alert('Error inicializando MediaPipe. Recarga la página (F5).');
      } finally {
        isInitializing = false;
      }
    };

    initMediaPipe();

    return () => {
      console.log('🧹 Limpieza...');
      if (globalCameraInstance) {
        try {
          globalCameraInstance.stop();
        } catch (e) {
          console.warn('Error en limpieza:', e);
        }
      }
    };
  }, [isActive, categoryColor]);

  if (!isActive) {
    return (
      <div style={{ 
        width: '100%', 
        maxWidth: '600px',
        height: '480px',
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
        width="640"
        height="480"
        autoPlay
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        width="640"
        height="480"
        style={{
          width: '100%',
          height: 'auto',
          border: `2px solid ${categoryColor}`,
          borderRadius: '8px',
          display: 'block',
          background: '#000'
        }}
      />
      {!isReady && (
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
          🔄 Iniciando MediaPipe...
        </div>
      )}
    </div>
  );
};

export default MediaPipeCamera;