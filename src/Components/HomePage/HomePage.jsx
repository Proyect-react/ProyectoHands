// src/components/HomePage.jsx
import "./HomePage.css";
import Header from "../Header/Header";
import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect } from "react";

function HomePage() {
  const navigate = useNavigate();
  const [progressData, setProgressData] = useState({
    completed: 0,
    accuracy: 0,
    sessions: 0,
    totalTime: 0,
    generalProgress: 0,
    masteredVowels: []
  });

  const handleTrainingClick = () => {
    navigate('/training');
  };

  // Obtener datos del localStorage al cargar el componente
  useEffect(() => {
    const loadProgressData = () => {
      const storedData = localStorage.getItem('practice_vocales_stats');
      const storedAllSessions = localStorage.getItem('practice_all_sessions_data'); // Todas las sesiones
      const vowels = ['A', 'E', 'I', 'O', 'U'];
      
      if (storedData) {
        const stats = JSON.parse(storedData);
        
        // Calcular vocales completadas (con 20 muestras)
        const completed = Object.values(stats).filter(count => count >= 20).length;
        
        // Calcular precisión promedio (simulada basada en progreso)
        const totalSamples = Object.values(stats).reduce((sum, count) => sum + count, 0);
        const maxPossibleSamples = vowels.length * 20;
        const accuracy = maxPossibleSamples > 0 ? Math.min(100, Math.round((totalSamples / maxPossibleSamples) * 100 * 0.8 + 20)) : 0;
        
        // Calcular sesiones (basado en TODAS las sesiones guardadas)
        let sessions = 0;
        let totalTimeMinutes = 0;
        
        if (storedAllSessions) {
          const allSessionData = JSON.parse(storedAllSessions);
          sessions = allSessionData.filter(session => session.endTime !== null).length;
          
          // Calcular tiempo total sumando todas las sesiones completadas
          totalTimeMinutes = allSessionData.reduce((total, session) => {
            return total + (session.duration || 0);
          }, 0);
          
          // Convertir a minutos
          totalTimeMinutes = Math.round(totalTimeMinutes / 60);
        }
        
        // Calcular progreso general
        const generalProgress = Math.round((totalSamples / (vowels.length * 20)) * 100);
        
        // Determinar vocales dominadas (completadas al 100%)
        const masteredVowels = vowels.filter(vowel => stats[vowel] >= 20);
        
        setProgressData({
          completed,
          accuracy,
          sessions,
          totalTime: totalTimeMinutes,
          generalProgress,
          masteredVowels
        });
      }
    };

    loadProgressData();
    
    // Escuchar cambios en el localStorage
    const handleStorageChange = () => {
      loadProgressData();
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Obtener sesiones recientes (máximo 5)
  const getRecentSessions = () => {
    const storedSessions = localStorage.getItem('practice_sessions_data');
    if (!storedSessions) return [];
    
    const sessions = JSON.parse(storedSessions);
    // Filtrar solo sesiones completadas y tomar las 5 más recientes
    return sessions
      .filter(session => session.endTime !== null)
      .slice(0, 5); // Limitar a 5 sesiones
  };

  // Formatear la duración de segundos a un formato legible
  const formatDuration = (seconds) => {
    if (seconds < 60) {
      return `${seconds}s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    }
  };

  // Tarjetas de progreso para vocales con datos reales
  const vocalProgressCards = (
    <div className="progress-cards">
      <div className="progress-card blue">
        <div className="card-icon">⭐</div>
        <div className="card-content">
          <span className="card-number">{progressData.completed}/5</span>
          <span className="card-text">Vocales Completadas</span>
        </div>
      </div>
      
      <div className="progress-card green">
        <div className="card-icon">🎪</div>
        <div className="card-content">
          <span className="card-number">{progressData.accuracy}%</span>
          <span className="card-text">Precisión Promedio</span>
        </div>
      </div>
      
      <div className="progress-card purple">
        <div className="card-icon">🚀</div>
        <div className="card-content">
          <span className="card-number">{progressData.sessions}</span>
          <span className="card-text">Sesiones Totales</span>
        </div>
      </div>
      
      <div className="progress-card yellow">
        <div className="card-icon">⏰</div>
        <div className="card-content">
          <span className="card-number">{progressData.totalTime}m</span>
          <span className="card-text">Tiempo Total</span>
        </div>
      </div>
    </div>
  );

  // Progreso general con datos reales
  const vocalGeneralProgress = (
    <div className="general-progress">
      <h3>Progreso General</h3>
      <div className="progress-bar-container">
        <div className="progress-bar">
          <div className="progress-fill" style={{width: `${progressData.generalProgress}%`}}></div>
        </div>
        <span className="progress-percentage">{progressData.generalProgress}%</span>
      </div>
    </div>
  );

  // Vocales dominadas con datos reales
  const vocalDominadas = (
    <div className="vowels-section">
      <h3>Vocales Dominadas</h3>
      <div className="vowels-container">
        <div className={`vowel ${progressData.masteredVowels.includes('A') ? 'mastered' : ''}`}>A</div>
        <div className={`vowel ${progressData.masteredVowels.includes('E') ? 'mastered' : ''}`}>E</div>
        <div className={`vowel ${progressData.masteredVowels.includes('I') ? 'mastered' : ''}`}>I</div>
        <div className={`vowel ${progressData.masteredVowels.includes('O') ? 'mastered' : ''}`}>O</div>
        <div className={`vowel ${progressData.masteredVowels.includes('U') ? 'mastered' : ''}`}>U</div>
      </div>
    </div>
  );

  // Sesiones recientes vocales con datos reales
  const vocalSesiones = (
    <div className="recent-sessions">
      <h3>Sesiones Recientes</h3>
      {getRecentSessions().length > 0 ? (
        getRecentSessions().map((session, index) => (
          <div key={session.id} className="session-item">
            <div className="session-info">
              <span className="session-title">Vocal {session.vowel}</span>
              <span className="session-details">{session.samplesCollected || 0} muestras • {formatDuration(session.duration || 0)}</span>
            </div>
            <div className="session-accuracy">
              {session.samplesCollected ? Math.min(100, Math.round((session.samplesCollected / 20) * 100)) : 0}%
            </div>
          </div>
        ))
      ) : (
        <p className="no-sessions">Aún no hay sesiones registradas</p>
      )}
    </div>
  );

  // Obtener progreso individual para cada vocal
  const getVowelProgress = (vowel) => {
    const storedData = localStorage.getItem('practice_vocales_stats');
    if (storedData) {
      const stats = JSON.parse(storedData);
      return stats[vowel] || 0;
    }
    return 0;
  };

  // Calcular porcentaje de progreso para cada vocal
  const calculateProgressPercentage = (vowel) => {
    const progress = getVowelProgress(vowel);
    return Math.min(100, Math.round((progress / 20) * 100));
  };

  // Tarjetas de entrenamiento con progreso real
  const vocalCards = (
    <div className="training-cards-container">
      {['A', 'E', 'I', 'O', 'U'].map((vowel, index) => {
        const progress = calculateProgressPercentage(vowel);
        const colorClass = ['blue', 'green', 'purple', 'yellow', 'orange'][index];
        
        return (
          <div key={vowel} className={`training-card ${colorClass}`}>
            <div className="card-icon">{vowel}</div>
            <div className="card-content">
              <span className="card-number"></span>
              <span className="card-text">Entrenamiento de vocal {vowel}</span>
              <div className="Img">
                <img 
                  src={process.env.PUBLIC_URL + `/img/Letra ${vowel}.jpg`} 
                  alt={`Letra ${vowel} en lenguaje de señas`} 
                  style={{ width: '80px', height: '80px', objectFit: 'contain' }}
                />
              </div>
              <button className="button" onClick={() => window.location.assign(`/EntrenarVocales?character=${vowel}`)}>Entrenar</button>
              <h3>Progreso</h3>
              <div className="progress-bar-container">
                <div className="progress-bar">
                  <div className="progress-fill" style={{width: `${progress}%`}}></div>
                </div>
                <span className="progress-percentage">{progress}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <Header />
      <div className="hero-section">
        <h1 className="main-title">Aprende Lenguaje de Señas con IA</h1>
        <p className="description">
          Sistema inteligente de reconocimiento de gestos para dominar las vocales del lenguaje de señas. 
          Entrenamientos personalizados con retroalimentación en tiempo real.
        </p>
        <button className="main-button" onClick={handleTrainingClick}>
          <span className="hand-icon">🤖</span>
          Entrenar Modelos Personalizados IA
        </button>
      </div>
      <div className="main-container">
        <div className="progress-section">
          <div className="progress-header">
            <h2>Tu Progreso</h2>
          </div>
          {vocalProgressCards}
        </div>
        {vocalGeneralProgress}
        {vocalDominadas}
        {vocalSesiones}
      </div>
      <div className="training-cards" style={{ marginTop: "3rem", paddingBottom: "2rem" }}>
        <h3>Entrenamiento de vocales</h3>
        {vocalCards}
      </div>
    </>
  );
}

export default HomePage;