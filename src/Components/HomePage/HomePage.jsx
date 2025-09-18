// src/components/HomePage.jsx
import "./HomePage.css";
import Header from "../Header/Header";
import { useNavigate } from 'react-router-dom';
import React from "react";

function HomePage() {
  const navigate = useNavigate();

  const handleTrainingClick = () => {
    navigate('/training');
  };

  // Tarjetas de progreso para vocales
  const vocalProgressCards = (
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
  );

  // Progreso general
  const vocalGeneralProgress = (
    <div className="general-progress">
      <h3>Progreso General</h3>
      <div className="progress-bar-container">
        <div className="progress-bar">
          <div className="progress-fill" style={{width: '20%'}}></div>
        </div>
        <span className="progress-percentage">20%</span>
      </div>
    </div>
  );

  // Vocales dominadas
  const vocalDominadas = (
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
  );

  // Sesiones recientes vocales
  const vocalSesiones = (
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

const vocalCards = (
  <div className="training-cards-container">
    <div className="training-card blue">
      <div className="card-icon">A</div>
      <div className="card-content">
        <span className="card-number"></span>
        <span className="card-text">Entrenamiento de vocal A</span>
        <div className="Img">
          <img 
            src={process.env.PUBLIC_URL + "/img/Letra A.jpg"} 
            alt="Letra A en lenguaje de señas" 
            style={{ width: '80px', height: '80px', objectFit: 'contain' }}
          />
        </div>
        <button className="button" onClick={() => window.location.assign('/EntrenarVocales?character=A')}>Entrenar</button>
        <h3>Progreso</h3>
        <div className="progress-bar-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{width: '100%'}}></div>
          </div>
          <span className="progress-percentage">100%</span>
        </div>
      </div>
    </div>
    <div className="training-card green">
      <div className="card-icon">E</div>
      <div className="card-content">
        <span className="card-number"></span>
        <span className="card-text">Entrenamiento de vocal E</span>
        <div className="Img">
          <img 
            src={process.env.PUBLIC_URL + "/img/Letra E.jpg"} 
            alt="Letra E en lenguaje de señas" 
            style={{ width: '80px', height: '80px', objectFit: 'contain' }}
          />
        </div>
        <button className="button" onClick={() => window.location.assign('/EntrenarVocales?character=E')}>Entrenar</button>
        <h3>Progreso</h3>
        <div className="progress-bar-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{width: '10%'}}></div>
          </div>
          <span className="progress-percentage">10%</span>
        </div>
      </div>
    </div>
    <div className="training-card purple">
      <div className="card-icon">I</div>
      <div className="card-content">
        <span className="card-number"></span>
        <span className="card-text">Entrenamiento de vocal I</span>
        <div className="Img">
          <img 
            src={process.env.PUBLIC_URL + "/img/Letra I.jpg"} 
            alt="Letra I en lenguaje de señas" 
            style={{ width: '80px', height: '80px', objectFit: 'contain' }}
          />
        </div>
        <button className="button" onClick={() => window.location.assign('/EntrenarVocales?character=I')}>Entrenar</button>
        <h3>Progreso</h3>
        <div className="progress-bar-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{width: '5%'}}></div>
          </div>
          <span className="progress-percentage">5%</span>
        </div>
      </div>
    </div>
    <div className="training-card yellow">
      <div className="card-icon">O</div>
      <div className="card-content">
        <span className="card-number"></span>
        <span className="card-text">Entrenamiento de vocal O</span>
        <div className="Img">
          <img 
            src={process.env.PUBLIC_URL + "/img/Letra O.jpg"} 
            alt="Letra O en lenguaje de señas" 
            style={{ width: '80px', height: '80px', objectFit: 'contain' }}
          />
        </div>
        <button className="button" onClick={() => window.location.assign('/EntrenarVocales?character=O')}>Entrenar</button>
        <h3>Progreso</h3>
        <div className="progress-bar-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{width: '2%'}}></div>
          </div>
          <span className="progress-percentage">2%</span>
        </div>
      </div>
    </div>
    <div className="training-card orange">
      <div className="card-icon">U</div>
      <div className="card-content">
        <span className="card-number"></span>
        <span className="card-text">Entrenamiento de vocal U</span>
        <div className="Img">
          <img 
            src={process.env.PUBLIC_URL + "/img/Letra U.jpg"} 
            alt="Letra U en lenguaje de señas" 
            style={{ width: '80px', height: '80px', objectFit: 'contain' }}
          />
        </div>
        <button className="button" onClick={() => window.location.assign('/EntrenarVocales?character=U')}>Entrenar</button>
        <h3>Progreso</h3>
        <div className="progress-bar-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{width: '15%'}}></div>
          </div>
          <span className="progress-percentage">15%</span>
        </div>
      </div>
    </div>
  </div>
);

export default HomePage;