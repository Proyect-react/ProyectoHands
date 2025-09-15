// src/components/HomePage.jsx
import "./HomePage.css";
import Header from "../Header/Header";
import { useNavigate } from 'react-router-dom';

function HomePage() {
  const navigate = useNavigate();

  const handleTrainingClick = () => {
    navigate('/training');
  };

  return (
    <>
      <Header />
      {/* Sección principal con título y descripción - FUERA del main-container */}
      <div className="hero-section">
        <h1 className="main-title">Aprende Lenguaje de Señas con IA</h1>
        <p className="description">
          Sistema inteligente de reconocimiento de gestos para dominar las vocales del lenguaje de señas. 
          Entrenamientos personalizados con feedback en tiempo real.
        </p>
        <button className="main-button" onClick={handleTrainingClick}>
          <span className="hand-icon">🤖</span>
          Entrenar Modelos Personalizados IA
        </button>
      </div>
      <div className="main-container">
        {/* Sección de progreso del usuario */}
        <div className="progress-section">
          <div className="progress-header">
            <h2>Tu Progreso</h2>
            <button className="level-button">
              <span>Intermedio</span>
              <span className="refresh-icon">🔄</span>
            </button>
          </div>
          
          <div className="progress-cards">
            <div className="progress-card blue">
              <div className="card-icon">⭐</div>
              <div className="card-content">
                <span className="card-number">1/5</span>
                <span className="card-text">Vocales Completadas</span>
              </div>
            </div>
            
            <div className="progress-card green">
              <div className="card-icon">🎪</div>
              <div className="card-content">
                <span className="card-number">68.8%</span>
                <span className="card-text">Precisión Promedio</span>
              </div>
            </div>
            
            <div className="progress-card purple">
              <div className="card-icon">🚀</div>
              <div className="card-content">
                <span className="card-number">2</span>
                <span className="card-text">Sesiones Totales</span>
              </div>
            </div>
            
            <div className="progress-card yellow">
              <div className="card-icon">⏰</div>
              <div className="card-content">
                <span className="card-number">1m</span>
                <span className="card-text">Tiempo Total</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progreso General */}
        <div className="general-progress">
          <h3>Progreso General</h3>
          <div className="progress-bar-container">
            <div className="progress-bar">
              <div className="progress-fill" style={{width: '20%'}}></div>
            </div>
            <span className="progress-percentage">20%</span>
          </div>
        </div>

        {/* Vocales Dominadas */}
        <div className="vowels-section">
          <h3>Vocales Dominadas</h3>
          <div className="vowels-container">
            <div className="vowel mastered">A</div>
            <div className="vowel">E</div>
            <div className="vowel">I</div>
            <div className="vowel">O</div>
            <div className="vowel">U</div>
          </div>
        </div>

        {/* Sesiones Recientes */}
        <div className="recent-sessions">
          <h3>Sesiones Recientes</h3>
          <div className="session-item">
            <div className="session-info">
              <span className="session-title">Vocal A</span>
              <span className="session-details">320 intentos • 25s</span>
            </div>
            <div className="session-accuracy">100.0%</div>
          </div>
        </div>
      </div>
    </>
  );
}

export default HomePage;