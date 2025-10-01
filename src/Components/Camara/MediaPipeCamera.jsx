// src/Components/TrainingPage/MediaPipeCamera.jsx - VERSIÓN CORREGIDA (Pantalla negra fixed)
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

const MediaPipeCamera = ({ onHandDetected, isActive, categoryColor = '#4CAF50', width = 700, height = 600 }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);

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
      console.log('🛑 Deteniendo cámara...');

      // Detener la cámara de MediaPipe primero
      if (cameraRef.current) {
        try {
          await cameraRef.current.stop();
        } catch (e) {
          console.warn('⚠️ Error deteniendo Camera:', e);
        }
        cameraRef.current = null;
      }
      
      // 🚨 CRÍTICO: También destruir Hands para forzar reinicio completo
      if (handsRef.current) {
        try {
          handsRef.current.close();
        } catch (e) {
          console.warn('⚠️ Error cerrando Hands:', e);
        }
        handsRef.current = null;
      }
      
      // Detener el stream manualmente
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('🛑 Track detenido:', track.label);
        });
        streamRef.current = null;
      }
      
      // Limpiar el elemento video
      const videoElement = videoRef.current;
      if (videoElement) {
        videoElement.srcObject = null;
        videoElement.pause();
        videoElement.load(); // Forzar reset del video
      }
      
      // Limpiar canvas completamente
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
      }
      
      console.log('✅ Cámara detenida completamente');
      
    } catch (error) {
      console.warn('⚠️ Error deteniendo cámara:', error);
    }
  };

  // 🆕 FUNCIÓN PARA INICIAR CÁMARA (CORREGIDA)
  const startCamera = async () => {
    if (!mountedRef.current) return;
    
    try {
      console.log('🎥 Iniciando cámara...');
      setIsReady(false);

      // Primero detener cualquier cámara existente
      await stopCameraCompletely();

      if (!mountedRef.current) return;

      const videoElement = videoRef.current;
      const canvas = canvasRef.current;

      if (!videoElement || !canvas) {
        throw new Error('Elementos de video o canvas no encontrados');
      }

      // Configurar dimensiones del canvas
      canvas.width = width;
      canvas.height = height;

      // Limpiar canvas e inicializarlo correctamente
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 🚨 PASO 1: Solicitar stream
      console.log('📹 Solicitando acceso a la cámara...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode: 'user'
        }
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      console.log('✅ Stream obtenido:', stream.id);
      streamRef.current = stream;

      // 🚨 PASO 2: Asignar stream al video
      videoElement.srcObject = stream;
      
      // 🚨 PASO 3: Esperar a que el video esté listo
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Timeout esperando video'));
        }, 10000);

        videoElement.onloadedmetadata = () => {
          console.log('✅ Metadata del video cargada');
          clearTimeout(timeoutId);
          resolve();
        };

        videoElement.onerror = (error) => {
          clearTimeout(timeoutId);
          reject(error);
        };
      });

      // 🚨 PASO 4: Reproducir video
      await videoElement.play();
      console.log('✅ Video reproduciendo');

      if (!mountedRef.current) return;

      // 🚨 PASO 5: SIEMPRE crear nueva instancia de Hands
      console.log('🤖 Inicializando MediaPipe Hands...');
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
        if (!mountedRef.current) return;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Dibujar imagen de la cámara
        if (results.image && results.image.width > 0 && results.image.height > 0) {
          try {
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
          } catch (drawError) {
            console.warn('⚠️ Error dibujando imagen:', drawError);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        } else {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

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
        }

        ctx.restore();
      });

      await hands.initialize();
      handsRef.current = hands;
      console.log('✅ MediaPipe Hands inicializado');

      if (!mountedRef.current) return;

      // 🚨 PASO 6: Crear nueva instancia de Camera
      console.log('🎬 Creando instancia de Camera...');
      const camera = new Camera(videoElement, {
        onFrame: async () => {
          if (!mountedRef.current) return;
          if (handsRef.current && videoElement.readyState === 4) {
            try {
              await handsRef.current.send({ image: videoElement });
            } catch (error) {
              if (mountedRef.current) {
                console.warn('⚠️ Error enviando frame a MediaPipe:', error);
              }
            }
          }
        },
        width: width,
        height: height
      });

      await camera.start();
      cameraRef.current = camera;

      if (!mountedRef.current) {
        await stopCameraCompletely();
        return;
      }

      console.log('✅ Cámara iniciada exitosamente');
      setIsReady(true);

    } catch (error) {
      console.error('❌ Error iniciando cámara:', error);
      setIsReady(false);
      
      // Limpiar en caso de error
      await stopCameraCompletely();
      
      // Mostrar error al usuario
      if (mountedRef.current) {
        alert(`Error iniciando cámara: ${error.message}\n\nAsegúrate de dar permisos de cámara.`);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    
    if (isActive) {
      startCamera();
    } else {
      stopCameraCompletely();
      setIsReady(false);
    }

    // Cleanup al desmontar el componente
    return () => {
      mountedRef.current = false;
      stopCameraCompletely();
    };
  }, [isActive]);

  if (!isActive) {
    return (
      <div style={{ 
        width: '100%', 
        maxWidth: '700px',
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
    <div style={{ width: '100%', maxWidth: '677px', position: 'relative' }}>
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