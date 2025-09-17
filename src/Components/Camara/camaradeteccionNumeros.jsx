import React, { useEffect, useRef, useState } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

// Conexiones entre los puntos de la mano
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Pulgar
  [0, 5], [5, 6], [6, 7], [7, 8], // Índice
  [5, 9], [9, 10], [10, 11], [11, 12], // Medio
  [9, 13], [13, 14], [14, 15], [15, 16], // Anular
  [13, 17], [17, 18], [18, 19], [19, 20], // Meñique
  [0, 17] // Lateral palma
];

// --- Funciones de ayuda ---
const distance = (a, b) =>
  Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

const isFingerBent = (landmarks, mcpIdx, pipIdx, tipIdx) => {
  const mcp = landmarks[mcpIdx];
  const pip = landmarks[pipIdx];
  const tip = landmarks[tipIdx];
  return distance(mcp, tip) < distance(mcp, pip);
};

const isThumbBent = (landmarks) => {
  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  return distance(wrist, thumbTip) < 0.15;
};

// --- Evaluación de números reales ---
const evaluateNumber = (landmarks, number) => {
  if (!landmarks) return { accuracy: 0 };

  const indexBent = isFingerBent(landmarks, 5, 6, 8);
  const middleBent = isFingerBent(landmarks, 9, 10, 12);
  const ringBent = isFingerBent(landmarks, 13, 14, 16);
  const pinkyBent = isFingerBent(landmarks, 17, 18, 20);
  const thumbBent = isThumbBent(landmarks);

  let expected = {};

  switch (number) {
    case "0": // Círculo con pulgar e índice
      expected = {
        thumb: false,
        index: false,
        middle: true,
        ring: true,
        pinky: true
      };
      if (distance(landmarks[4], landmarks[8]) > 0.08) return { accuracy: 0 };
      break;

    case "1": // Índice arriba
      expected = {
        thumb: true,
        index: false,
        middle: true,
        ring: true,
        pinky: true
      };
      break;

    case "2": // Índice y medio arriba
      expected = {
        thumb: true,
        index: false,
        middle: false,
        ring: true,
        pinky: true
      };
      break;

    case "3": // Índice, medio y pulgar arriba
      expected = {
        thumb: false,
        index: false,
        middle: false,
        ring: true,
        pinky: true
      };
      break;

    case "4": // Todos menos pulgar
      expected = {
        thumb: true,
        index: false,
        middle: false,
        ring: false,
        pinky: false
      };
      break;

    case "5": // Todos extendidos
      expected = {
        thumb: false,
        index: false,
        middle: false,
        ring: false,
        pinky: false
      };
      break;

    case "6": // Pulgar toca meñique
      if (distance(landmarks[4], landmarks[20]) > 0.08) return { accuracy: 0 };
      break;

    case "7": // Pulgar toca anular
      if (distance(landmarks[4], landmarks[16]) > 0.08) return { accuracy: 0 };
      break;

    case "8": // Pulgar toca medio
      if (distance(landmarks[4], landmarks[12]) > 0.08) return { accuracy: 0 };
      break;

    case "9": // Pulgar toca índice
      if (distance(landmarks[4], landmarks[8]) > 0.08) return { accuracy: 0 };
      break;

    default:
      return { accuracy: 0 };
  }

  const actual = {
    thumb: thumbBent,
    index: indexBent,
    middle: middleBent,
    ring: ringBent,
    pinky: pinkyBent
  };

  let score = 0,
    total = 0;
  for (const f of Object.keys(expected)) {
    total++;
    if (expected[f] === actual[f]) score++;
  }

  return { accuracy: Math.round((score / total) * 100) };
};

// --- Componente ---
const DeteccionNumeros = ({ character = "0" }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [accuracy, setAccuracy] = useState(0);

  useEffect(() => {
    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults((results) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
          const evalRes = evaluateNumber(landmarks, character);
          setAccuracy(evalRes.accuracy);

          ctx.strokeStyle = "lime";
          ctx.lineWidth = 2;
          for (const [s, e] of HAND_CONNECTIONS) {
            const a = landmarks[s];
            const b = landmarks[e];
            ctx.beginPath();
            ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
            ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
            ctx.stroke();
          }

          landmarks.forEach((point) => {
            ctx.beginPath();
            ctx.arc(point.x * canvas.width, point.y * canvas.height, 5, 0, 2 * Math.PI);
            ctx.fillStyle = "red";
            ctx.fill();
          });
        }
      }
    });

    const videoElement = videoRef.current;
    if (videoElement) {
      const camera = new Camera(videoElement, {
        onFrame: async () => {
          await hands.send({ image: videoElement });
        },
        width: 700,
        height: 500,
      });
      camera.start();
    }
  }, [character]);

  return (
    <div style={{ position: "relative", maxWidth: "1000px" }}>
      <video ref={videoRef} style={{ display: "none" }} width="800" height="500" autoPlay playsInline />
      <canvas ref={canvasRef} width="900" height="500" style={{ borderRadius: "20px", background: "#000", width: "100%" }} />
      <div
        style={{
          position: "absolute",
          bottom: "10px",
          left: "10px",
          background: "rgba(0,0,0,0.7)",
          color: accuracy > 70 ? "lightgreen" : "lightcoral",
          padding: "10px",
          borderRadius: "5px",
          fontSize: "16px",
        }}
      >
        Número: {character} | Precisión: {accuracy}%
      </div>
    </div>
  );
};

export default DeteccionNumeros;
