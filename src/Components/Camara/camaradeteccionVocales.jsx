import React, { useEffect, useRef, useState } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

// Definición de las conexiones entre puntos de la mano según MediaPipe
// Estas conexiones forman el esqueleto visual de la mano
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],     // Pulgar
  [0, 5], [5, 6], [6, 7], [7, 8],     // Índice
  [5, 9], [9, 10], [10, 11], [11, 12], // Medio
  [9, 13], [13, 14], [14, 15], [15, 16], // Anular
  [13, 17], [17, 18], [18, 19], [19, 20], // Meñique
  [0, 17] // Conexión base de la palma
];

/**
 * Calcula la distancia euclidiana entre dos puntos 2D
 * @param {Object} p1 - Punto 1 con coordenadas x, y
 * @param {Object} p2 - Punto 2 con coordenadas x, y
 * @returns {number} Distancia entre los puntos
 */
const distance = (p1, p2) =>
  Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

/**
 * Calcula el ángulo formado por tres puntos (a-b-c), donde b es el vértice
 * @param {Object} a - Primer punto
 * @param {Object} b - Punto vértice (donde se forma el ángulo)
 * @param {Object} c - Tercer punto
 * @returns {number} Ángulo en radianes
 */
const angleAt = (a, b, c) => {
  // Crear vectores desde b hacia a y c
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  
  // Calcular producto punto de los vectores
  const dot = v1.x * v2.x + v1.y * v2.y;
  
  // Calcular magnitudes de los vectores
  const n1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const n2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  
  // Evitar división por cero
  if (n1 === 0 || n2 === 0) return Math.PI;
  
  // Calcular coseno del ángulo y limitar su rango
  const cos = Math.max(-1, Math.min(1, dot / (n1 * n2)));
  return Math.acos(cos);
};

/**
 * Calcula qué tan doblado está un dedo basándose en el ángulo de sus articulaciones
 * @param {Array} landmarks - Puntos de la mano detectados por MediaPipe
 * @param {number} baseIdx - Índice del punto base del dedo
 * @param {number} pipIdx - Índice del punto de articulación media
 * @param {number} tipIdx - Índice de la punta del dedo
 * @param {number} thresholdDeg - Umbral de ángulo en grados (default 155°)
 * @returns {number} Valor entre 0-1 donde 1 = completamente doblado
 */
const fingerBentScore = (landmarks, baseIdx, pipIdx, tipIdx, thresholdDeg = 155) => {
  // Calcular ángulo entre los tres puntos del dedo
  const ang = angleAt(landmarks[baseIdx], landmarks[pipIdx], landmarks[tipIdx]);
  const thresholdRad = (thresholdDeg * Math.PI) / 180;
  
  // Convertir a escala 0-1 donde 1 significa completamente doblado
  const bentAmount = Math.max(0, Math.min(1, (thresholdRad - ang) / (thresholdRad * 0.5)));
  return bentAmount;
};

/**
 * Calcula qué tan doblado está el pulgar (tiene geometría diferente)
 * @param {Array} landmarks - Puntos de la mano
 * @param {number} thresholdDeg - Umbral específico para el pulgar
 * @returns {number} Valor entre 0-1 de flexión del pulgar
 */
const thumbBentScore = (landmarks, thresholdDeg = 145) => {
  return fingerBentScore(landmarks, 1, 2, 4, thresholdDeg);
};

/**
 * Calcula la precisión final como porcentaje con decimales
 * @param {number} score - Puntaje obtenido
 * @param {number} totalRules - Total de reglas evaluadas
 * @returns {number} Precisión entre 0-100%
 */
const calculatePrecision = (score, totalRules) => {
  const rawAccuracy = (score / totalRules) * 100;
  return Math.min(100, Math.max(0, Math.round(rawAccuracy * 10) / 10));
};

/**
 * Función principal que evalúa si la mano forma correctamente una vocal específica
 * @param {Array} landmarks - Array de 21 puntos de la mano detectados por MediaPipe
 * @param {string} targetVowel - Vocal objetivo ("A", "E", "I", "O", "U")
 * @returns {Object} Objeto con precisión, estadísticas y análisis detallado
 */
const evaluateHand = (landmarks, targetVowel) => {
  // Extraer puntos importantes de la mano
  const thumbTip = landmarks[4];   // Punta del pulgar
  const indexTip = landmarks[8];   // Punta del índice
  const middleTip = landmarks[12]; // Punta del medio
  const ringTip = landmarks[16];   // Punta del anular
  const pinkyTip = landmarks[20];  // Punta del meñique
  const wrist = landmarks[0];      // Muñeca

  // Calcular tamaño de la palma para normalizar medidas
  let palmSize = distance(wrist, landmarks[9]);
  if (palmSize < 1e-6) palmSize = 1e-6; // Evitar división por cero

  // Calcular scores de flexión para cada dedo (0 = extendido, 1 = doblado)
  const indexBentScore = fingerBentScore(landmarks, 5, 6, 8);
  const middleBentScore = fingerBentScore(landmarks, 9, 10, 12);
  const ringBentScore = fingerBentScore(landmarks, 13, 14, 16);
  const pinkyBentScore = fingerBentScore(landmarks, 17, 18, 20);
  const thumbBentScoreValue = thumbBentScore(landmarks);

  // Umbral para considerar un dedo como "doblado"
  const BENT_THRESHOLD = 0.7;
  const indexBent = indexBentScore > BENT_THRESHOLD;
  const middleBent = middleBentScore > BENT_THRESHOLD;
  const ringBent = ringBentScore > BENT_THRESHOLD;
  const pinkyBent = pinkyBentScore > BENT_THRESHOLD;
  const thumbBent = thumbBentScoreValue > BENT_THRESHOLD;

  // Calcular distancias normalizadas entre dedos (relativas al tamaño de la palma)
  const d_thumb_index = distance(thumbTip, indexTip) / palmSize;
  const d_index_middle = distance(indexTip, middleTip) / palmSize;
  const d_middle_ring = distance(middleTip, ringTip) / palmSize;
  const d_ring_pinky = distance(ringTip, pinkyTip) / palmSize;

  // Calcular distancia promedio de todos los dedos al pulgar
  const avgTipDistToThumb = (
    distance(indexTip, thumbTip) +
    distance(middleTip, thumbTip) +
    distance(ringTip, thumbTip) +
    distance(pinkyTip, thumbTip)
  ) / (4 * palmSize);

  // Calcular separación promedio entre dedos consecutivos
  const avgFingerSpread = (
    d_index_middle + d_middle_ring + d_ring_pinky
  ) / 3;

  // Inicializar variables para el análisis
  const expected = { thumb: false, index: false, middle: false, ring: false, pinky: false };
  let totalRules = 0;
  let score = 0;

  // Evaluar cada vocal específica con sus reglas únicas
  switch (targetVowel) {
    case "A":
      // VOCAL A: Pulgar extendido, otros 4 dedos doblados
      expected.thumb = false;   // extendido
      expected.index = true;    // doblado
      expected.middle = true;   // doblado
      expected.ring = true;     // doblado
      expected.pinky = true;    // doblado
      totalRules = 5;

      // Evaluar cada dedo según lo esperado
      score += (1 - thumbBentScoreValue);  // Pulgar debe estar extendido
      score += indexBentScore;             // Otros deben estar doblados
      score += middleBentScore;
      score += ringBentScore;
      score += pinkyBentScore;

      // Regla adicional: dedos doblados deben estar juntos
      totalRules += 1;
      const aTightScore = Math.max(0, 1 - (Math.max(0, avgFingerSpread - 0.10) / 0.10));
      score += aTightScore;
      break;

    case "E":
      // VOCAL E: Todos los dedos doblados formando un puño
      expected.index = expected.middle = expected.ring = expected.pinky = expected.thumb = true;
      totalRules = 6;

      score += indexBentScore;
      score += middleBentScore;
      score += ringBentScore;
      score += pinkyBentScore;
      score += thumbBentScoreValue;

      // Regla adicional: todos los dedos deben estar cerca del pulgar
      const eScore = Math.max(0, 1 - (Math.max(0, avgTipDistToThumb - 0.35) / 0.2));
      score += eScore;
      break;

    case "I":
      // VOCAL I: Índice, medio y anular doblados; meñique extendido
      expected.index = expected.middle = expected.ring = expected.thumb = true;
      expected.pinky = false;  // extendido
      totalRules = 5;

      score += indexBentScore;
      score += middleBentScore;
      score += ringBentScore;
      score += (1 - pinkyBentScore); // Meñique debe estar extendido
      score += thumbBentScoreValue;

      // Regla adicional: meñique debe estar bien separado del anular
      totalRules += 1;
      const iSpreadScore = Math.max(0, 1 - (Math.max(0, 0.15 - d_ring_pinky) / 0.15));
      score += iSpreadScore;
      break;

    case "O":
      // VOCAL O: Todos los dedos doblados, pulgar toca el índice
      expected.index = expected.middle = expected.ring = expected.pinky = expected.thumb = true;
      totalRules = 5;

      score += indexBentScore;
      score += middleBentScore;
      score += ringBentScore;
      score += pinkyBentScore;

      // Regla adicional: pulgar debe estar muy cerca del índice
      const oScore = Math.max(0, 1 - (Math.max(0, d_thumb_index - 0.15) / 0.15));
      score += oScore;
      break;

    case "U":
      // VOCAL U: Anular y meñique doblados; índice y medio extendidos
      expected.ring = expected.pinky = expected.thumb = true;
      expected.index = expected.middle = false;  // extendidos
      totalRules = 6;

      score += (1 - indexBentScore);  // Índice extendido
      score += (1 - middleBentScore); // Medio extendido
      score += ringBentScore;         // Anular doblado
      score += pinkyBentScore;        // Meñique doblado
      score += thumbBentScoreValue;   // Pulgar doblado

      // Regla adicional: índice y medio deben estar juntos
      const uScore = Math.max(0, 1 - (Math.max(0, d_index_middle - 0.30) / 0.20));
      score += uScore;
      break;

    default:
      // Vocal no reconocida
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

  // Calcular precisión final como porcentaje
  const accuracy = calculatePrecision(score, totalRules);

  // Retornar análisis completo
  return {
    accuracy,                    // Precisión final (0-100%)
    palmSize,                   // Tamaño de la palma para referencia
    expected,                   // Estado esperado de cada dedo
    actualBent: {               // Estado actual detectado de cada dedo
      index: indexBent,
      middle: middleBent,
      ring: ringBent,
      pinky: pinkyBent,
      thumb: thumbBent
    },
    extras: {                   // Métricas adicionales para debug
      d_thumb_index,
      avgTipDistToThumb,
      d_index_middle,
      d_middle_ring,
      d_ring_pinky,
      avgFingerSpread
    },
    bentScores: {               // Scores de flexión raw (0-1) para cada dedo
      index: indexBentScore,
      middle: middleBentScore,
      ring: ringBentScore,
      pinky: pinkyBentScore,
      thumb: thumbBentScoreValue
    }
  };
};

/**
 * Componente React principal para detección de vocales en tiempo real
 * @param {string} character - Vocal objetivo a detectar ("A", "E", "I", "O", "U")
 * @param {Function} onPrecisionUpdate - Callback que recibe la precisión actualizada
 */
const DeteccionVocales = ({ character = "A", onPrecisionUpdate }) => {
  // Referencias para elementos DOM y objetos MediaPipe
  const videoRef = useRef(null);      // Elemento video (oculto)
  const canvasRef = useRef(null);     // Canvas donde se dibuja la visualización
  const cameraRef = useRef(null);     // Objeto Camera de MediaPipe
  const handsRef = useRef(null);      // Objeto Hands de MediaPipe
  
  // Estados del componente
  const [accuracy, setAccuracy] = useState(0);      // Precisión actual
  const [isPerfect, setIsPerfect] = useState(false); // Si la precisión es perfecta

  useEffect(() => {
    // Inicializar MediaPipe Hands
    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    // Configurar opciones de detección
    hands.setOptions({
      maxNumHands: 1,              // Detectar máximo 1 mano
      modelComplexity: 1,          // Complejidad del modelo (0=lite, 1=full)
      minDetectionConfidence: 0.8,  // Confianza mínima para detectar mano
      minTrackingConfidence: 0.8    // Confianza mínima para seguimiento
    });

    // Callback principal cuando MediaPipe detecta resultados
    hands.onResults((results) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Limpiar canvas y dibujar imagen de video
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      // Si se detecta al menos una mano
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0]; // Tomar la primera mano
        const evalResult = evaluateHand(landmarks, character); // Evaluar la vocal

        // Actualizar estados locales
        setAccuracy(evalResult.accuracy);
        setIsPerfect(evalResult.accuracy >= 99.5);
        
        // Notificar al componente padre de la nueva precisión
        if (onPrecisionUpdate) onPrecisionUpdate(evalResult.accuracy);

        // Dibujar conexiones entre puntos de la mano
        ctx.lineWidth = 2;
        for (const [s, e] of HAND_CONNECTIONS) {
          const a = landmarks[s];
          const b = landmarks[e];
          if (a && b) {
            ctx.beginPath();
            ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
            ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
            ctx.strokeStyle = "rgba(0,255,0,0.45)"; // Verde semitransparente
            ctx.stroke();
          }
        }

        // Dibujar todos los puntos de la mano como círculos rojos
        for (const landmark of landmarks) {
          ctx.beginPath();
          ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, 2 * Math.PI);
          ctx.fillStyle = "red";
          ctx.fill();
        }

        // Dibujar las puntas de los dedos con colores específicos y etiquetas
        const fingerTips = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
        for (const fingerName of Object.keys(fingerTips)) {
          const tipIdx = fingerTips[fingerName];
          const tip = landmarks[tipIdx];
          const expectedBent = evalResult.expected[fingerName];
          const actualBent = evalResult.actualBent[fingerName];
          
          // Verde si coincide con lo esperado, rojo si no
          const match = expectedBent === undefined ? true : (expectedBent === actualBent);
          const color = match ? "lime" : "red";

          // Dibujar círculo más grande en la punta del dedo
          ctx.beginPath();
          ctx.arc(tip.x * canvas.width, tip.y * canvas.height, 8, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();

          // Dibujar etiqueta del dedo
          ctx.font = "12px Arial";
          ctx.fillStyle = "white";
          ctx.fillText(fingerName, tip.x * canvas.width + 10, tip.y * canvas.height + 4);
        }

      } else {
        // No se detecta mano
        setAccuracy(0);
        setIsPerfect(false);
        if (onPrecisionUpdate) onPrecisionUpdate(0);
        
        // Mostrar mensaje de "no se detecta mano"
        ctx.font = "20px Arial";
        ctx.fillStyle = "white";
        ctx.fillText("No se detecta mano", 20, 40);
      }

      ctx.restore();
    });

    handsRef.current = hands;

    // Inicializar cámara
    const videoElement = videoRef.current;
    if (videoElement) {
      const camera = new Camera(videoElement, {
        onFrame: async () => {
          if (videoElement) await hands.send({ image: videoElement });
        },
        width: 700,   // Ancho del video
        height: 500   // Alto del video
      });
      cameraRef.current = camera;
      camera.start(); // Iniciar captura de video
    }

    // Cleanup al desmontar componente
    return () => {
      if (cameraRef.current) cameraRef.current.stop?.();
      if (videoElement && videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach((t) => t.stop()); // Detener todos los tracks de video
      }
      handsRef.current && handsRef.current.onResults(() => { }); // Limpiar callback
    };
  }, [character, onPrecisionUpdate]); // Re-ejecutar si cambia la vocal objetivo

  // Render del componente
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
      {/* Video oculto que captura la cámara */}
      <video
        ref={videoRef}
        style={{ display: "none" }}
        width="800"
        height="500"
        autoPlay
        playsInline
      />
      
      {/* Canvas visible donde se dibuja la detección */}
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

      {/* Indicador visual de precisión (actualmente vacío pero reservado) */}
      {accuracy > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "10px",
            background: "transparent",
            color: isPerfect ? "lightgreen" : "lightcoral",
            padding: "10px",
            borderRadius: "5px",
            fontSize: "16px",
            zIndex: 10
          }}
        >
          {/* Contenido vacío - podría mostrar mensajes de retroalimentación */}
        </div>
      )}

      {/* Panel de información adicional (actualmente vacío) */}
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
        {/* Contenido vacío - podría mostrar información de debug */}
      </div>
    </div>
  );
};

export default DeteccionVocales;