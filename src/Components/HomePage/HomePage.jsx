// src/components/HomePage.jsx
import "./HomePage.css";
import VoiceAssistant from "../VoiceAssistant/VoiceAssistant";
import CollectPage from "../TrainingPage/recolectar";
import TrainPage from "../TrainingPage/Entrenamiento";
import PracticePage from "../TrainingPage/Practica";
import { speakAction } from "../VoiceAssistant/VoiceActions";
import { useState, useEffect } from "react";

// 🔹 Componente Modal reutilizable
function Modal({ title, message, onClose }) {
  if (!message) return null;
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <button onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

function HomePage() {
  const [activeTab, setActiveTab] = useState("inicio");
  const [isLoggedIn, setIsLoggedIn] = useState(false); // 🔑 estado login
  const [credentials, setCredentials] = useState({ user: "", pass: "" });
  const [modalData, setModalData] = useState({ title: "", message: "" });

  // Efecto para mensaje de bienvenida inicial
  useEffect(() => {
    const timer = setTimeout(() => {
      speakAction('navigation', 'inicio');
    }, 1000); // Esperar 1 segundo después de cargar

    return () => clearTimeout(timer);
  }, []);

  const handleTabClick = (tabName) => {
    // Verificar acceso para secciones restringidas
    if (!isLoggedIn && (tabName === "capturar" || tabName === "entrenar")) {
      setModalData({
        title: "Acceso Restringido",
        message: "⚠️ Solo administradores pueden acceder a esta sección.",
      });
      setActiveTab("inicio");
      return;
    }
    
    setActiveTab(tabName);
    // Activar voz para la acción de navegación
    speakAction('navigation', tabName);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (credentials.user === "admin" && credentials.pass === "1234") {
      setIsLoggedIn(true);
      setModalData({ title: "Login Exitoso", message: "✅ Bienvenido administrador" });
      setActiveTab("inicio");
      setCredentials({ user: "", pass: "" }); // Limpiar campos
    } else {
      setModalData({
        title: "Error de Autenticación",
        message: "❌ Usuario o contraseña incorrectos",
      });
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setActiveTab("inicio");
    setModalData({ title: "Sesión Cerrada", message: "👋 Has cerrado sesión correctamente" });
  };

  // Renderizar el contenido según la pestaña activa
  const renderTabContent = () => {
    switch (activeTab) {
      case "capturar":
        return <CollectPage />;
      case "entrenar":
        return <TrainPage />;
      case "practicar":
        return <PracticePage />;
      case "login":
        return renderLoginForm();
      case "inicio":
      default:
        return renderHomeContent();
    }
  };

  // Formulario de login
  const renderLoginForm = () => (
    <div className="login-container" style={{
      maxWidth: '400px',
      margin: '40px auto',
      padding: '30px',
      background: '#f5f5f5',
      borderRadius: '10px',
      textAlign: 'center'
    }}>
      <h2 style={{ marginBottom: '20px', color: '#333' }}>Iniciar Sesión</h2>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <input
          type="text"
          placeholder="Usuario"
          value={credentials.user}
          onChange={(e) => setCredentials({ ...credentials, user: e.target.value })}
          style={{
            padding: '12px',
            borderRadius: '5px',
            border: '1px solid #ccc',
            fontSize: '16px'
          }}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={credentials.pass}
          onChange={(e) => setCredentials({ ...credentials, pass: e.target.value })}
          style={{
            padding: '12px',
            borderRadius: '5px',
            border: '1px solid #ccc',
            fontSize: '16px'
          }}
        />
        <button 
          type="submit"
          style={{
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            padding: '12px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600'
          }}
        >
          Entrar
        </button>
      </form>
    </div>
  );

  // Contenido de la página de inicio (MANTENIDO EXACTAMENTE IGUAL)
  const renderHomeContent = () => (
    <>
      {/* Main Cards Section */}
      <div className="main-cards-section">
        <div className="main-cards-container">
          <div className="main-card">
            <div className="card-icon">📷</div>
            <h3 className="card-title">Capturar Gestos</h3>
            <p className="card-description">
              Usa tu cámara para capturar y etiquetar gestos de lenguaje de señas por categorías específicas
            </p>
            {!isLoggedIn && (
              <div style={{
                marginTop: '10px',
                padding: '5px 10px',
                background: '#ff9800',
                color: 'white',
                borderRadius: '15px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                🔒 Admin requerido
              </div>
            )}
          </div>

          <div className="main-card">
            <div className="card-icon">🧠</div>
            <h3 className="card-title">Entrenar IA</h3>
            <p className="card-description">
              Entrena tu modelo de inteligencia artificial con los gestos capturados
            </p>
            {!isLoggedIn && (
              <div style={{
                marginTop: '10px',
                padding: '5px 10px',
                background: '#ff9800',
                color: 'white',
                borderRadius: '15px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                🔒 Admin requerido
              </div>
            )}
          </div>

          <div className="main-card">
            <div className="card-icon">🎮</div>
            <h3 className="card-title">Practicar</h3>
            <p className="card-description">
              Practica lenguaje de señas con reconocimiento inteligente en tiempo real
            </p>
            <div style={{
              marginTop: '10px',
              padding: '5px 10px',
              background: '#4CAF50',
              color: 'white',
              borderRadius: '15px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              ✅ Acceso libre
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
              <li>Palabras básicas de uso cotidiano</li>
              <li>Operaciones aritméticas básicas</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="homepage-container">
      
      <VoiceAssistant />
      
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
        
        {/* Navigation Tabs - MODIFICADO PARA INCLUIR LOGIN/LOGOUT */}
        <div className="navigation-tabs">
          <div 
            className={`nav-tab ${activeTab === "inicio" ? "active" : ""}`}
            onClick={() => handleTabClick("inicio")}
          >
            <span className="tab-icon">🤚</span>
            <span className="text">Inicio</span>
            <span className="notification-dot"></span>
          </div>
          <div 
            className={`nav-tab ${activeTab === "capturar" ? "active" : ""}`}
            onClick={() => handleTabClick("capturar")}
          >
            <span className="tab-icon">📷</span>
            <span className="text">Capturar</span>
            <span className="notification-dot"></span>
          </div>
          <div 
            className={`nav-tab ${activeTab === "entrenar" ? "active" : ""}`}
            onClick={() => handleTabClick("entrenar")}
          >
            <span className="tab-icon">🧠</span>
            <span className="text">Entrenar</span>
            <span className="notification-dot"></span>
          </div>
          <div 
            className={`nav-tab ${activeTab === "practicar" ? "active" : ""}`}
            onClick={() => handleTabClick("practicar")}
          >
            <span className="tab-icon">🎮</span>
            <span className="text">Practicar</span>
            <span className="notification-dot"></span>
          </div>
          
          {/* Botón de Login/Logout */}
          {!isLoggedIn ? (
            <div 
              className={`nav-tab ${activeTab === "login" ? "active" : ""}`}
              onClick={() => setActiveTab("login")}
            >
              <span className="tab-icon">🔑</span>
              <span className="text">Login</span>
            </div>
          ) : (
            <div 
              className="nav-tab logout-tab"
              onClick={handleLogout}
            >
              <span className="tab-icon">🚪</span>
              <span className="text">Salir</span>
            </div>
          )}
        </div>
      </div>

      {/* Renderizar el contenido según la pestaña activa */}
      {renderTabContent()}

      {/* Modal para mensajes */}
      <Modal
        title={modalData.title}
        message={modalData.message}
        onClose={() => setModalData({ title: "", message: "" })}
      />
    </div>
  );
}

export default HomePage;