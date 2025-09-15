import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './TrainingPage.css';

function TrainingPage() {
  const navigate = useNavigate();
  const [currentLetter] = useState('');
  const [samples] = useState(0);
  const [progress] = useState(0);
  const [models] = useState([]);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const handleBackToHome = () => {
    navigate('/');
  };

  const handleCollectData = () => {
    // Aquí irá la lógica para recolectar datos de la cámara
    console.log('Recolectando datos para la letra:', currentLetter);
  };

  const handleDeleteModel = (modelId) => {
    // Aquí irá la lógica para eliminar el modelo
    console.log('Eliminando modelo:', modelId);
  };

  const handleStartCamera = () => {
    setIsCameraActive(true);
    console.log('Iniciando cámara');
  };

  const handlePauseCamera = () => {
    setIsCameraActive(false);
    console.log('Pausando cámara');
  };

  const handleStopCamera = () => {
    setIsCameraActive(false);
    console.log('Deteniendo cámara');
  };

  return (
    <div className="training-container">
      {/* Header */}
      <div className="training-header">
        <button className="back-button" onClick={handleBackToHome}>
          ← Volver al Inicio
        </button>
        <h1>Crea y entrena modelos personalizados</h1>
          <button className='NuevoModelo'>Crear Modelo</button>
      </div>

      {/* Main Content */}
      <div className="training-content">
        {/* Left Column - Mis Modelos */}
        <div className="models-section">
          <div className="section-header">
            <h2>🧠 Mis Modelos</h2>
          </div>
          
          {models.length === 0 ? (
            <div className="no-models">
              <p>No tienes modelos creados aún</p>
              <p>Crea tu primer modelo para comenzar</p>
            </div>
          ) : (
            models.map((model) => (
              <div key={model.id} className="model-card">
                <div className="model-header">
                  <h3>{model.name}</h3>
                  <button className="delete-button" onClick={() => handleDeleteModel(model.id)}>
                    🗑️
                  </button>
                </div>
                <div className="model-info">
                  <p><strong>Tipo:</strong> {model.type} • {model.labels} etiquetas</p>
                  <p><strong>Muestras:</strong> {model.samples} muestras</p>
                </div>
                <div className="model-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{width: `${model.progress}%`}}></div>
                  </div>
                  <span className="progress-text">{model.progress}%</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column - Cámara de Entrenamiento */}
        <div className="camera-section">
          <div className="section-header">
            <h2>📹 Cámara de Entrenamiento</h2>
          </div>
          
          <div className="camera-feed">
            <div className="camera-placeholder">
              <div className="camera-icon-large">📹</div>
              <p>{isCameraActive ? 'Vista previa de la cámara' : 'Cámara no iniciada'}</p>
              <p className="camera-description">
                {isCameraActive 
                  ? 'Posiciona tu mano frente a la cámara para entrenar el modelo'
                  : 'Haz clic en "Iniciar Cámara" para comenzar'
                }
              </p>
              <div className="camera-status">
                <span className={`status-dot ${isCameraActive ? 'active' : ''}`}></span>
                <span>{isCameraActive ? 'Cámara activa' : 'Cámara inactiva'}</span>
              </div>
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
                  onClick={handlePauseCamera}
                  disabled={!isCameraActive}
                >
                  ⏸️ Pausar
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
          </div>

          <div className="training-controls">
            <h3>Entrenamiento: {currentLetter || 'Selecciona una letra'}</h3>
            <div className="current-letter">
              <div className="letter-display">{currentLetter || '?'}</div>
            </div>
            <button 
              className="collect-button" 
              onClick={handleCollectData}
              disabled={!isCameraActive || !currentLetter}
            >
              Recolectar Datos
            </button>
            <div className="training-stats">
              <p><strong>{samples} Total Muestras</strong></p>
              <p>{progress}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TrainingPage;
