import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './EntrenarVocales.css';
import DeteccionVocales from '../../Camara/camaradeteccionVocales';

// 🔥 CLAVES SEPARADAS SOLO PARA PRÁCTICA (no interfieren con TrainingPage)
const LOCAL_STORAGE_PRACTICE_KEY = 'practice_vocales_stats';
const LOCAL_STORAGE_SESSIONS_KEY = 'practice_sessions_data';
const LOCAL_STORAGE_ALL_SESSIONS_KEY = 'practice_all_sessions_data'; // Para todas las sesiones
const MAX_RECENT_SESSIONS = 5; // Límite de sesiones recientes a mostrar

function EntrenarVocales() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const characterFromURL = queryParams.get('character') || 'A';

  // Estado simple solo para práctica - NO modelos
  const [practiceStats, setPracticeStats] = useState(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_PRACTICE_KEY);
    return stored ? JSON.parse(stored) : {};
  });

  const [currentLetter] = useState(characterFromURL);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [currentPrecision, setCurrentPrecision] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(null);

  // Usar useRef para el intervalo
  const autoIncrementInterval = useRef(null);
  // Ref para mantener el estado más reciente
  const practiceStatsRef = useRef(practiceStats);

  // Número de muestras objetivo
  const MUESTRAS_OBJETIVO = 20;

  // Obtener los aciertos para la vocal actual
  const currentSamples = practiceStats[currentLetter] || 0;

  // Mantener sincronizada la ref y guardar en localStorage
  useEffect(() => {
    practiceStatsRef.current = practiceStats;
    localStorage.setItem(LOCAL_STORAGE_PRACTICE_KEY, JSON.stringify(practiceStats));
  }, [practiceStats]);

  // Función para registrar una nueva sesión
  const registerNewSession = useCallback(() => {
    const startTime = new Date();
    setSessionStartTime(startTime);
    
    // Obtener sesiones existentes
    const existingSessions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SESSIONS_KEY) || '[]');
    const allSessions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_ALL_SESSIONS_KEY) || '[]');
    
    // Crear nueva sesión
    const newSession = {
      id: Date.now(),
      vowel: currentLetter,
      startTime: startTime.toISOString(),
      endTime: null,
      duration: 0,
      samplesCollected: 0
    };
    
    // Agregar a sesiones recientes (limitado a MAX_RECENT_SESSIONS)
    const updatedSessions = [newSession, ...existingSessions].slice(0, MAX_RECENT_SESSIONS);
    localStorage.setItem(LOCAL_STORAGE_SESSIONS_KEY, JSON.stringify(updatedSessions));
    
    // Agregar a todas las sesiones (sin límite)
    const updatedAllSessions = [newSession, ...allSessions];
    localStorage.setItem(LOCAL_STORAGE_ALL_SESSIONS_KEY, JSON.stringify(updatedAllSessions));
    
    return newSession.id;
  }, [currentLetter]);

  // Función para finalizar una sesión
  const finalizeSession = useCallback((sessionId, samples) => {
    const endTime = new Date();
    const duration = Math.round((endTime - sessionStartTime) / 1000); // en segundos
    
    // Actualizar la sesión en sesiones recientes
    const existingSessions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SESSIONS_KEY) || '[]');
    const updatedSessions = existingSessions.map(session => {
      if (session.id === sessionId) {
        return {
          ...session,
          endTime: endTime.toISOString(),
          duration: duration,
          samplesCollected: samples
        };
      }
      return session;
    });
    localStorage.setItem(LOCAL_STORAGE_SESSIONS_KEY, JSON.stringify(updatedSessions));
    
    // Actualizar la sesión en todas las sesiones
    const allSessions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_ALL_SESSIONS_KEY) || '[]');
    const updatedAllSessions = allSessions.map(session => {
      if (session.id === sessionId) {
        return {
          ...session,
          endTime: endTime.toISOString(),
          duration: duration,
          samplesCollected: samples
        };
      }
      return session;
    });
    localStorage.setItem(LOCAL_STORAGE_ALL_SESSIONS_KEY, JSON.stringify(updatedAllSessions));
  }, [sessionStartTime]);

  // Función para actualizar la precisión desde el componente de cámara
  const handlePrecisionUpdate = useCallback((precision) => {
    setCurrentPrecision(precision);
  }, []);

  // Efecto para manejar el intervalo de incremento automático
  // 1. Efecto solo para limpiar al desmontar
  useEffect(() => {
    return () => {
      if (autoIncrementInterval.current) {
        clearInterval(autoIncrementInterval.current);
        autoIncrementInterval.current = null;
        console.log("🧹 Intervalo limpiado al desmontar");
      }
    };
  }, []);

  // 2. Efecto para manejar el auto-incremento
  useEffect(() => {
    const currentSamples = practiceStatsRef.current[currentLetter] || 0;

    // 🚨 Si ya llegaste al objetivo, no vuelvas a hacer nada
    if (currentSamples >= MUESTRAS_OBJETIVO) {
      if (autoIncrementInterval.current) {
        clearInterval(autoIncrementInterval.current);
        autoIncrementInterval.current = null;
        console.log("🏁 Meta alcanzada, intervalo detenido y no se reiniciará");
      }
      return; // ⬅️ clave: salimos del efecto
    }

    const cumpleCondiciones =
      currentPrecision >= 90 && isCameraActive && currentLetter;

    if (!cumpleCondiciones) {
      if (autoIncrementInterval.current) {
        clearInterval(autoIncrementInterval.current);
        autoIncrementInterval.current = null;
        console.log("🛑 Intervalo detenido (condiciones no cumplidas)");
      }
      return;
    }

    // Si ya existe, no lo vuelvas a crear
    if (autoIncrementInterval.current) return;

    console.log("🚀 Iniciando auto-incremento cada 2 segundos");
    autoIncrementInterval.current = setInterval(() => {
      setPracticeStats(prevStats => {
        const currentSamples = prevStats[currentLetter] || 0;

        if (currentSamples >= MUESTRAS_OBJETIVO) {
          clearInterval(autoIncrementInterval.current);
          autoIncrementInterval.current = null;
          console.log("🏁 Meta de 20 alcanzada, intervalo detenido");
          return prevStats; // no sube más
        }

        console.log("➕ Incrementando aciertos:", currentSamples + 1);
        return {
          ...prevStats,
          [currentLetter]: currentSamples + 1
        };
      });
    }, 2000);
  }, [currentPrecision, isCameraActive, currentLetter, MUESTRAS_OBJETIVO]);

  const handleBackToHome = () => {
    navigate('/');
  };

  const handleStartCamera = () => {
    console.log('📷 Iniciando cámara');
    setIsCameraActive(true);
    registerNewSession();
  };

  const handleStopCamera = () => {
    console.log('⏹️ Deteniendo cámara');
    
    // Finalizar la sesión actual
    if (sessionStartTime) {
      const sessions = JSON.parse(localStorage.getItem(LOCAL_STORAGE_SESSIONS_KEY) || '[]');
      if (sessions.length > 0 && !sessions[0].endTime) {
        finalizeSession(sessions[0].id, currentSamples);
      }
    }
    
    setIsCameraActive(false);
    setCurrentPrecision(0); // Resetear precisión cuando se detiene la cámara
    setSessionStartTime(null);

    // Detener el intervalo automático si está activo
    if (autoIncrementInterval.current) {
      clearInterval(autoIncrementInterval.current);
      autoIncrementInterval.current = null;
      console.log('🛑 Intervalo automático detenido');
    }
  };

  // Obtener la ruta de la imagen según el carácter
  const getImagePath = (char) => {
    return process.env.PUBLIC_URL + `/img/Letra ${char}.jpg`;
  };

  return (
    <div className="training-container">

      {/* Header */}
      <div className="training-header">
        <button className="back-button" onClick={handleBackToHome}>
          ← Volver al Inicio
        </button>
        <h1>Entrenar Vocales - {characterFromURL}</h1>
      </div>

      {/* Main Content */}
      <div className="training-content">
        {/* Left Column - Imagen de la vocal */}
        <div className="models-section" style={{ minHeight: "400px", maxWidth: "600px", marginBottom: "2rem", boxSizing: "border-box" }}>
          <div className="training-card blue" style={{ minHeight: "350px", maxWidth: "500px", margin: "0 auto", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div className="card-content" style={{ flex: 1, minHeight: "300px", justifyContent: "center", fontSize: "2rem" }}>
              <span className="card-number" style={{ fontSize: "2.5rem" }}></span>
              <span className="card-text" style={{ fontSize: "2rem" }}>Entrenamiento de vocal {characterFromURL}</span>
              <div className="Img" style={{ display: "flex", justifyContent: "center" }}>
                <img
                  src={getImagePath(characterFromURL)}
                  alt={`Letra ${characterFromURL} en lenguaje de señas`}
                  style={{ width: '200px', height: '200px', objectFit: 'contain' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Cámara de Entrenamiento */}
        <div className="camera-section">
          <div className="section-header">
            <h2>📹 Cámara de Entrenamiento</h2>
            <div className="camera-controls">
              <button
                className="camera-btn"
                onClick={handleStartCamera}
                disabled={isCameraActive}
              >
                📷 Iniciar Cámara
              </button>
              <button
                className="camera-btn"
                onClick={handleStopCamera}
                disabled={!isCameraActive}
              >
                ⏹️ Detener
              </button>
            </div>
          </div>

          <div className="camera-feed">
            {isCameraActive ? (
              <DeteccionVocales
                character={characterFromURL}
                onPrecisionUpdate={handlePrecisionUpdate}
              />
            ) : (
              <div className="camera-placeholder">
                <div className="camera-icon-large">📹</div>
                <p>Cámara no iniciada</p>
                <p className="camera-description">
                  Haz clic en "Iniciar Cámara" para comenzar
                </p>
              </div>
            )}
          </div>

          {/* Controles de entrenamiento */}
          <div className="training-controls">
            <div className="current-letter">
              <div className="letter-display">{currentLetter || '?'}</div>
            </div>
            {/* Tarjetas de información */}
            <div className="training-cards-container" style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'center' }}>
              <div className="training-card" style={{
                background: '#fff',
                color: '#2D1B69',
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                minWidth: '120px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(45,27,105,0.10)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Aciertos</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{currentSamples} / {MUESTRAS_OBJETIVO}</div>
              </div>
              <div className="training-card" style={{
                background: '#fff',
                color: '##2D1B69',
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                minWidth: '120px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(45,27,105,0.10)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Precisión actual</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{currentPrecision}%</div>
              </div>
              <div className="training-card" style={{
                background: currentSamples >= MUESTRAS_OBJETIVO ? '#11998E' : '#eee',
                color: currentSamples >= MUESTRAS_OBJETIVO ? '#fff' : '#aaa',
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                minWidth: '120px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(45,27,105,0.10)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Estado</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>
                  {currentSamples >= MUESTRAS_OBJETIVO ? 'Completado' : 'Practicando'}
                </div>
              </div>
            </div>
            {/* Fin tarjetas */}
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(EntrenarVocales);