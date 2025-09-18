import React, { useEffect, useRef, useState } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

// Conexiones
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
];

const distance = (p1, p2) =>
  Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

const angleAt = (a, b, c) => {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const n1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const n2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  if (n1 === 0 || n2 === 0) return Math.PI;
  const cos = Math.max(-1, Math.min(1, dot / (n1 * n2)));
  return Math.acos(cos);
};

// Función mejorada para detección de flexión de dedos con escala gradual
const fingerBentScore = (landmarks, baseIdx, pipIdx, tipIdx, thresholdDeg = 155) => {
  const ang = angleAt(landmarks[baseIdx], landmarks[pipIdx], landmarks[tipIdx]);
  const thresholdRad = (thresholdDeg * Math.PI) / 180;
  // Convertir a escala 0-1 donde 1 significa completamente doblado
  const bentAmount = Math.max(0, Math.min(1, (thresholdRad - ang) / (thresholdRad * 0.5)));
  return bentAmount;
};

const thumbBentScore = (landmarks, thresholdDeg = 145) => {
  return fingerBentScore(landmarks, 1, 2, 4, thresholdDeg);
};

// Función para calcular precisión con decimales
const calculatePrecision = (score, totalRules) => {
  const rawAccuracy = (score / totalRules) * 100;
  return Math.min(100, Math.max(0, Math.round(rawAccuracy * 10) / 10));
};

const evaluateHand = (landmarks, targetVowel) => {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];
  const wrist = landmarks[0];

  let palmSize = distance(wrist, landmarks[9]);
  if (palmSize < 1e-6) palmSize = 1e-6;

  // Detección de dedos doblados con escala gradual
  const indexBentScore = fingerBentScore(landmarks, 5, 6, 8);
  const middleBentScore = fingerBentScore(landmarks, 9, 10, 12);
  const ringBentScore = fingerBentScore(landmarks, 13, 14, 16);
  const pinkyBentScore = fingerBentScore(landmarks, 17, 18, 20);
  const thumbBentScoreValue = thumbBentScore(landmarks);

  // Umbral para considerar un dedo como doblado (ajustado para mayor precisión)
  const BENT_THRESHOLD = 0.7;
  const indexBent = indexBentScore > BENT_THRESHOLD;
  const middleBent = middleBentScore > BENT_THRESHOLD;
  const ringBent = ringBentScore > BENT_THRESHOLD;
  const pinkyBent = pinkyBentScore > BENT_THRESHOLD;
  const thumbBent = thumbBentScoreValue > BENT_THRESHOLD;

  // Distancias normalizadas con umbrales milimétricos
  const d_thumb_index = distance(thumbTip, indexTip) / palmSize;
  const d_index_middle = distance(indexTip, middleTip) / palmSize;
  const d_middle_ring = distance(middleTip, ringTip) / palmSize;
  const d_ring_pinky = distance(ringTip, pinkyTip) / palmSize;
  const d_thumb_palm = distance(thumbTip, landmarks[0]) / palmSize;

  const avgTipDistToThumb = (
    distance(indexTip, thumbTip) +
    distance(middleTip, thumbTip) +
    distance(ringTip, thumbTip) +
    distance(pinkyTip, thumbTip)
  ) / (4 * palmSize);

  // Calcular separación promedio entre dedos
  const avgFingerSpread = (
    d_index_middle + d_middle_ring + d_ring_pinky
  ) / 3;

  const expected = { thumb: false, index: false, middle: false, ring: false, pinky: false };
  let totalRules = 0;
  let score = 0;

  // Umbrales de distancia y ángulo estrictos para precisión milimétrica
  switch (targetVowel) {
    case "A":
      // Para la A: pulgar estirado, otros 4 doblados
      expected.thumb = false;   // estirado
      expected.index = true;    // doblado
      expected.middle = true;   // doblado
      expected.ring = true;     // doblado
      expected.pinky = true;    // doblado
      totalRules = 5;

      // Pulgar estirado → mientras menos doblado, mejor
      score += (1 - thumbBentScoreValue);

      // Otros 4 deben estar doblados → mientras más doblados, mejor
      score += indexBentScore;
      score += middleBentScore;
      score += ringBentScore;
      score += pinkyBentScore;

      // (Opcional) Regla adicional: asegurar que los dedos doblados estén lo suficientemente cerca
      totalRules += 1;
      const aTightScore = Math.max(0, 1 - (Math.max(0, avgFingerSpread - 0.10) / 0.10));
      score += aTightScore;
      break;

    case "E":
      expected.index = expected.middle = expected.ring = expected.pinky = expected.thumb = true;
      totalRules = 6;

      score += indexBentScore;
      score += middleBentScore;
      score += ringBentScore;
      score += pinkyBentScore;
      score += thumbBentScoreValue;

      // Umbral milimétrico: avgTipDistToThumb < 0.55 con escala gradual
      const eScore = Math.max(0, 1 - (Math.max(0, avgTipDistToThumb - 0.35) / 0.2));
      score += eScore;
      break;

    case "I":
      // Para la I, índice, medio y anillo doblados, meñique extendido
      expected.index = expected.middle = expected.ring = expected.thumb = true;
      expected.pinky = false;
      totalRules = 5;

      score += indexBentScore;
      score += middleBentScore;
      score += ringBentScore;
      score += (1 - pinkyBentScore); // Meñique debe estar extendido
      score += thumbBentScoreValue;

      // Añadir regla adicional para asegurar que el meñique está bien separado
      totalRules += 1;
      const iSpreadScore = Math.max(0, 1 - (Math.max(0, 0.15 - d_ring_pinky) / 0.15));
      score += iSpreadScore;
      break;

    case "O":
      expected.index = expected.middle = expected.ring = expected.pinky = expected.thumb = true;
      totalRules = 5;

      score += indexBentScore;
      score += middleBentScore;
      score += ringBentScore;
      score += pinkyBentScore;

      // Umbral milimétrico: d_thumb_index < 0.30 con escala gradual
      const oScore = Math.max(0, 1 - (Math.max(0, d_thumb_index - 0.15) / 0.15));
      score += oScore;
      break;

    case "U":
      expected.ring = expected.pinky = expected.thumb = true;
      expected.index = expected.middle = false;
      totalRules = 6;

      score += (1 - indexBentScore); // Índice extendido
      score += (1 - middleBentScore); // Medio extendido
      score += ringBentScore;
      score += pinkyBentScore;
      score += thumbBentScoreValue;

      // Umbral milimétrico: d_index_middle < 0.50 con escala gradual
      const uScore = Math.max(0, 1 - (Math.max(0, d_index_middle - 0.30) / 0.20));
      score += uScore;
      break;

    default:
      return {
        accuracy: 0,
        palmSize,
        expected,
        actualBent: {
          index: indexBent,
          middle: middleBent,
          ring: ringBent,
          pinky: pinkyBent,
          thumb: thumbBent
        }
      };
  }

  // Precisión milimétrica con decimales
  const accuracy = calculatePrecision(score, totalRules);

  return {
    accuracy,
    palmSize,
    expected,
    actualBent: {
      index: indexBent,
      middle: middleBent,
      ring: ringBent,
      pinky: pinkyBent,
      thumb: thumbBent
    },
    extras: {
      d_thumb_index,
      avgTipDistToThumb,
      d_index_middle,
      d_middle_ring,
      d_ring_pinky,
      avgFingerSpread
    },
    bentScores: {
      index: indexBentScore,
      middle: middleBentScore,
      ring: ringBentScore,
      pinky: pinkyBentScore,
      thumb: thumbBentScoreValue
    }
  };
};

const DeteccionVocales = ({ character = "A", onPrecisionUpdate }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const handsRef = useRef(null);
  const [accuracy, setAccuracy] = useState(0);
  const [isPerfect, setIsPerfect] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");

  useEffect(() => {
    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.8,
      minTrackingConfidence: 0.8
    });

    hands.onResults((results) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const evalResult = evaluateHand(landmarks, character);

        setAccuracy(evalResult.accuracy);
        setIsPerfect(evalResult.accuracy >= 99.5);
        if (onPrecisionUpdate) onPrecisionUpdate(evalResult.accuracy);

        // Información de depuración
        setDebugInfo(
          `Flexión: I:${evalResult.bentScores.index.toFixed(2)}, M:${evalResult.bentScores.middle.toFixed(2)}, A:${evalResult.bentScores.ring.toFixed(2)}, Ñ:${evalResult.bentScores.pinky.toFixed(2)}, P:${evalResult.bentScores.thumb.toFixed(2)}`
        );

        ctx.lineWidth = 2;
        for (const [s, e] of HAND_CONNECTIONS) {
          const a = landmarks[s];
          const b = landmarks[e];
          if (a && b) {
            ctx.beginPath();
            ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
            ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
            ctx.strokeStyle = "rgba(0,255,0,0.45)";
            ctx.stroke();
          }
        }

        for (const landmark of landmarks) {
          ctx.beginPath();
          ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, 2 * Math.PI);
          ctx.fillStyle = "red";
          ctx.fill();
        }

        const fingerTips = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
        for (const fingerName of Object.keys(fingerTips)) {
          const tipIdx = fingerTips[fingerName];
          const tip = landmarks[tipIdx];
          const expectedBent = evalResult.expected[fingerName];
          const actualBent = evalResult.actualBent[fingerName];
          const match = expectedBent === undefined ? true : (expectedBent === actualBent);
          const color = match ? "lime" : "red";

          ctx.beginPath();
          ctx.arc(tip.x * canvas.width, tip.y * canvas.height, 8, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();

          ctx.font = "12px Arial";
          ctx.fillStyle = "white";
          ctx.fillText(fingerName, tip.x * canvas.width + 10, tip.y * canvas.height + 4);
        }

        // Mostrar precisión con formato 00.0 a 100.0
        const formattedAccuracy = evalResult.accuracy.toFixed(1).padStart(4, '0');

      } else {
        setAccuracy(0);
        setIsPerfect(false);
        setDebugInfo("");
        if (onPrecisionUpdate) onPrecisionUpdate(0);
        ctx.font = "20px Arial";
        ctx.fillStyle = "white";
        ctx.fillText("No se detecta mano", 20, 40);
      }

      ctx.restore();
    });

    handsRef.current = hands;

    const videoElement = videoRef.current;
    if (videoElement) {
      const camera = new Camera(videoElement, {
        onFrame: async () => {
          if (videoElement) await hands.send({ image: videoElement });
        },
        width: 700,
        height: 500
      });
      cameraRef.current = camera;
      camera.start();
    }

    return () => {
      if (cameraRef.current) cameraRef.current.stop?.();
      if (videoElement && videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach((t) => t.stop());
      }
      handsRef.current && handsRef.current.onResults(() => { });
    };
  }, [character, onPrecisionUpdate]);

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
        padding: "0",
        position: "relative"
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

      {accuracy > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "10px",
            background: "trasparent",
            color: isPerfect ? "lightgreen" : "lightcoral",
            padding: "10px",
            borderRadius: "5px",
            fontSize: "16px",
            zIndex: 10
          }}
        >
          
        </div>
      )}

      <div
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          background: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "10px",
          borderRadius: "5px",
          fontSize: "12px",
          zIndex: 10,
          maxWidth: "300px"
        }}
      >
      </div>
    </div>
  );
};

export default DeteccionVocales;