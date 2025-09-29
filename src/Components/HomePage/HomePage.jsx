// src/components/HomePage.jsx
import "./HomePage.css";
import Header from "../Header/Header";
import { useNavigate } from "react-router-dom";

function HomePage() {
  const navigate = useNavigate();

  const handleCaptureClick = () => {
    navigate("/capture");
  };

  const handleTrainClick = () => {
    navigate("/training");
  };

  const handlePracticeClick = () => {
    navigate("/practice");
  };

  return (
    <div className="homepage-container">
      <Header />
      
      {/* Main Header Section */}
      <div className="main-header">
        <div className="title-section">
          <div className="title-icon">🤚</div>
          <h1 className="main-title">Aprendizaje de Lenguaje de Señas con IA</h1>
          <p className="main-subtitle">
            Plataforma inteligente para aprender lenguaje de señas usando inteligencia artificial 
            y reconocimiento de gestos en tiempo real
          </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="navigation-tabs">
          <div className="nav-tab active">
            <span className="tab-icon">🤚</span>
            <span className="text">Inicio</span>
            <span className="notification-dot"></span>
          </div>
          <div className="nav-tab">
            <span className="tab-icon">📷</span>
            <span className="text">Capturar</span>
            <span className="notification-dot"></span>
          </div>
          <div className="nav-tab">
            <span className="tab-icon">🧠</span>
            <span className="text">Entrenar</span>
            <span className="notification-dot"></span>
          </div>
          <div className="nav-tab">
            <span className="tab-icon">🎮</span>
            <span className="text">Practicar</span>
            <span className="notification-dot"></span>
          </div>
        </div>
      </div>

      {/* Main Cards Section */}
      <div className="main-cards-section">
        <div className="main-cards-container">
          <div className="main-card">
            <div className="card-icon">📷</div>
            <h3 className="card-title">Capturar Gestos</h3>
            <p className="card-description">
              Usa tu cámara para capturar y etiquetar gestos de lenguaje de señas por categorías específicas
            </p>
            <div className="card-buttons">
              <button className="primary-button" onClick={handleCaptureClick}>
                Crear Dataset
              </button>
              <label className="admin-button">Requiere Admin</label>
            </div>
          </div>

          <div className="main-card">
            <div className="card-icon">🧠</div>
            <h3 className="card-title">Entrenar IA</h3>
            <p className="card-description">
              Entrena tu modelo de inteligencia artificial con los gestos capturados
            </p>
            <div className="card-buttons">
              <button className="primary-button" onClick={handleTrainClick}>
                Machine Learning
              </button>
              <label className="admin-button">Requiere Admin</label>
            </div>
          </div>

          <div className="main-card">
            <div className="card-icon">🎮</div>
            <h3 className="card-title">Practicar</h3>
            <p className="card-description">
              Practica lenguaje de señas con reconocimiento inteligente en tiempo real
            </p>
            <div className="card-buttons">
              <button className="primary-button" onClick={handlePracticeClick}>
                Reconocimiento IA
              </button>
              <label className="free-button">Acceso Libre</label>
            </div>
          </div>
        </div>
      </div>

      {/* How to Start Section */}
      <div className="how-to-start-section">
        <div className="how-to-start-container">
          <h2 className="section-title">Cómo empezar</h2>
          
          <div className="steps-container">
            <div className="step-item">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3 className="step-title">Capturar</h3>
                <p className="step-description">
                  Selecciona categoría y etiqueta específica, luego usa la cámara 
                  para capturar gestos organizadamente
                </p>
                <span className="status-badge admin-required">Admin requerido</span>
              </div>
            </div>

            <div className="step-item">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3 className="step-title">Entrenar</h3>
                <p className="step-description">
                  Entrena tu modelo de IA con los gestos capturados 
                  para reconocimiento preciso
                </p>
                <span className="status-badge admin-required">Admin requerido</span>
              </div>
            </div>

            <div className="step-item">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3 className="step-title">Practicar</h3>
                <p className="step-description">
                  Practica con reconocimiento en tiempo real 
                  y mejora tus habilidades
                </p>
                <span className="status-badge free-access">Acceso libre</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Features */}
      <div className="platform-features-section">
        <div className="platform-features-container">
          <div className="feature-column">
            <div className="feature-header">
              <span className="feature-icon">💡</span>
              <h3 className="feature-title">Aprendizaje Personalizado</h3>
            </div>
            <ul className="feature-list">
              <li>Captura tus propios gestos organizados por categorías</li>
              <li>Selección específica de letras, números y palabras</li>
              <li>Entrena modelos de IA adaptados a tu estilo de señas</li>
              <li>Practica con retroalimentación instantánea y precisa</li>
            </ul>
          </div>

          <div className="feature-column">
            <div className="feature-header">
              <span className="feature-icon">📖</span>
              <h3 className="feature-title">Contenido Completo</h3>
            </div>
            <ul className="feature-list">
              <li>Vocales (A, E, I, O, U)</li>
              <li>Números del 0 al 9</li>
              <li>Abecedario completo A-Z</li>
              <li>Palabras básicas de uso cotidiano</li>
              <li>Operaciones aritméticas básicas</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;