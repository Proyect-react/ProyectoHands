import React, { useEffect, useRef } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

// Definimos las conexiones entre los puntos de la mano según el modelo de MediaPipe
const HAND_CONNECTIONS = [
  // Palma
  [0, 1], [1, 2], [2, 3], [3, 4], // Pulgar
  [0, 5], [5, 6], [6, 7], [7, 8], // Índice
  [5, 9], [9, 10], [10, 11], [11, 12], // Medio
  [9, 13], [13, 14], [14, 15], [15, 16], // Anular
  [13, 17], [17, 18], [18, 19], [19, 20], // Meñique
  [0, 17] // Borde de la palma
];

const MediapipeHands = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const handsRef = useRef(null);

  useEffect(() => {
    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.min.js`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults((results) => {
      const canvas = canvasRef.current;
      if (!canvas) return; // si canvas ya no existe
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
          // Dibujar conexiones entre los puntos
          ctx.strokeStyle = "lime";
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
          // Dibujar los puntos
          for (const landmark of landmarks) {
            ctx.beginPath();
            ctx.arc(
              landmark.x * canvas.width,
              landmark.y * canvas.height,
              5,
              0,
              2 * Math.PI
            );
            ctx.fillStyle = "red";
            ctx.fill();
          }
        }
      }

      ctx.restore();
    });

    handsRef.current = hands;

    // Capturar la referencia del video al inicio del efecto
    const videoElement = videoRef.current;

    if (videoElement) {
      const camera = new Camera(videoElement, {
        onFrame: async () => {
          if (videoElement) {
            await hands.send({ image: videoElement });
          }
        },
        width: 700,
        height: 500,
      });
      cameraRef.current = camera;
      camera.start();
    }

    // 🔹 Cleanup al desmontar el componente
    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop?.();
      }
      if (videoElement && videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }
      // cortar el callback de MediaPipe
      handsRef.current && handsRef.current.onResults(() => {});
    };
  }, []);

  // El div principal usa exactamente la misma clase y estilos que el placeholder
  return (
    <div
      className="camera-placeholder"
      style={{
        minHeight: "500px",
        borderRadius: "20px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.5))",
        border: "2px dashed rgba(255, 255, 255, 0.3)",
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "1000px",
        transition: "all 0.3s ease",
        textAlign: "center",
        padding: "0" // Esto sobreescribe el padding de la clase y permite que el contenido esté más cerca al borde
      }}
    >
      <video
        ref={videoRef}
        style={{ display: "none" }}
        width="800"
        height="500"
        autoPlay
        playsInline
      />
      <canvas
        ref={canvasRef}
        width="900"
        height="500"
        style={{
          borderRadius: "20px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          background: "#000",
          width: "100%",
          height: "500px",
          maxWidth: "100%",
          display: "block"
        }}
      />
    </div>
  );
};

export default MediapipeHands;
