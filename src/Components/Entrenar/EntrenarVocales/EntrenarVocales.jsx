import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './EntrenarVocales.css';
import DeteccionVocales from '../../Camara/camaradeteccionVocales';

const LOCAL_STORAGE_MODELS_KEY = 'training_models_v1';
const LOCAL_STORAGE_LABELSTATS_KEY = 'training_labelStats_v2';
const LOCAL_STORAGE_SELECTED_MODEL_KEY = 'training_selectedModelId_v1';

function getLabelStatsKey(modelId, label) {
  return `${modelId}__${label}`;
}

function EntrenarVocales() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const characterFromURL = queryParams.get('character') || 'A';

  // Persist models in localStorage
  const [models, setModels] = useState(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_MODELS_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  // Persist labelStats in localStorage
  const [labelStats, setLabelStats] = useState(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_LABELSTATS_KEY);
    return stored ? JSON.parse(stored) : {};
  });

  // Persist selected model
  const [selectedModelId, setSelectedModelId] = useState(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_SELECTED_MODEL_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  // Etiqueta seleccionada (por modelo)
  const [currentLetter, setCurrentLetter] = useState(characterFromURL);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showCreateModelModal, setShowCreateModelModal] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelType, setNewModelType] = useState('Clasificación');
  const [newModelLabels, setNewModelLabels] = useState(['']);

  // Número de muestras objetivo
  const MUESTRAS_OBJETIVO = 20;

  // Guardar models en localStorage cuando cambian
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_MODELS_KEY, JSON.stringify(models));
  }, [models]);

  // Guardar labelStats en localStorage cuando cambian
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_LABELSTATS_KEY, JSON.stringify(labelStats));
  }, [labelStats]);

  // Guardar modelo seleccionado en localStorage cuando cambia
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_SELECTED_MODEL_KEY, JSON.stringify(selectedModelId));
  }, [selectedModelId]);

  // Si no hay modelo seleccionado pero hay modelos, seleccionar el primero
  useEffect(() => {
    if (!selectedModelId && models.length > 0) {
      setSelectedModelId(models[0].id);
    }
    // Si se borra el modelo seleccionado, seleccionar otro o ninguno
    if (selectedModelId && !models.find(m => m.id === selectedModelId)) {
      setSelectedModelId(models.length > 0 ? models[0].id : null);
      setCurrentLetter(characterFromURL);
    }
  }, [models, selectedModelId, characterFromURL]);

  // Obtener el modelo seleccionado
  const selectedModel = models.find(m => m.id === selectedModelId);

  // Etiquetas del modelo seleccionado
  const modelLabels = selectedModel && Array.isArray(selectedModel.labels) ? selectedModel.labels : [];

  // Obtener los valores actuales de la etiqueta seleccionada (por modelo)
  let samples = 0, precision = 0;
  if (selectedModel && currentLetter) {
    const key = getLabelStatsKey(selectedModel.id, currentLetter);
    samples = labelStats[key]?.samples || 0;
    precision = labelStats[key]?.precision || 0;
  }

  const handleBackToHome = () => {
    navigate('/');
  };

  const handleCollectData = () => {
    if (!currentLetter || !selectedModel) return;
    const key = getLabelStatsKey(selectedModel.id, currentLetter);
    const prevStats = labelStats[key] || { samples: 0, progress: 0, precision: 0 };
    if (prevStats.samples < MUESTRAS_OBJETIVO) {
      const nuevasMuestras = prevStats.samples + 1;
      const nuevoProgreso = Math.round((nuevasMuestras / MUESTRAS_OBJETIVO) * 100);
      const nuevaPrecision = Math.min(100, Math.round((nuevasMuestras / MUESTRAS_OBJETIVO) * 90 + 10));
      setLabelStats({
        ...labelStats,
        [key]: {
          samples: nuevasMuestras,
          progress: nuevoProgreso,
          precision: nuevaPrecision,
        }
      });
      // Actualizar progreso y muestras del modelo
      if (selectedModel) {
        const modelIndex = models.findIndex(m => m.id === selectedModel.id);
        if (modelIndex !== -1) {
          // Calcular progreso global del modelo (promedio de progreso de sus etiquetas)
          const labelProgs = selectedModel.labels.map(label => {
            const lkey = getLabelStatsKey(selectedModel.id, label);
            return label === currentLetter
              ? nuevoProgreso
              : labelStats[lkey]?.progress || 0;
          });
          const avgProgress = Math.round(
            labelProgs.reduce((a, b) => a + b, 0) / labelProgs.length
          );
          const totalSamples = selectedModel.labels.reduce(
            (acc, label) => {
              const lkey = getLabelStatsKey(selectedModel.id, label);
              return acc + (label === currentLetter ? nuevasMuestras : (labelStats[lkey]?.samples || 0));
            },
            0
          );
          const updatedModels = [...models];
          updatedModels[modelIndex] = {
            ...selectedModel,
            progress: avgProgress,
            samples: totalSamples,
          };
          setModels(updatedModels);
        }
      }
    }
  };

  const handleDeleteModel = (modelId) => {
    // Eliminar modelo
    const modeloEliminado = models.find((model) => model.id === modelId);
    setModels(models.filter((model) => model.id !== modelId));
    // Eliminar stats de las etiquetas asociadas a ese modelo
    if (modeloEliminado && Array.isArray(modeloEliminado.labels)) {
      const nuevasStats = { ...labelStats };
      modeloEliminado.labels.forEach(label => {
        const key = getLabelStatsKey(modeloEliminado.id, label);
        delete nuevasStats[key];
      });
      setLabelStats(nuevasStats);
      // Si la etiqueta actual era de este modelo, limpiar selección
      if (modeloEliminado.labels.includes(currentLetter)) {
        setCurrentLetter(characterFromURL);
      }
    }
    // Si el modelo eliminado era el seleccionado, seleccionar otro
    if (selectedModelId === modelId) {
      const remaining = models.filter((model) => model.id !== modelId);
      setSelectedModelId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleStartCamera = () => {
    setIsCameraActive(true);
  };

  const handleStopCamera = () => {
    setIsCameraActive(false);
  };

  const handleOpenCreateModelModal = () => {
    setShowCreateModelModal(true);
  };

  const handleCloseCreateModelModal = () => {
    setShowCreateModelModal(false);
    setNewModelName('');
    setNewModelType('Clasificación');
    setNewModelLabels(['']);
  };

  const handleLabelChange = (index, value) => {
    const nuevasEtiquetas = [...newModelLabels];
    nuevasEtiquetas[index] = value;
    setNewModelLabels(nuevasEtiquetas);
  };

  const handleAddLabel = () => {
    setNewModelLabels([...newModelLabels, '']);
  };

  const handleRemoveLabel = (index) => {
    if (newModelLabels.length === 1) return;
    const nuevasEtiquetas = newModelLabels.filter((_, i) => i !== index);
    setNewModelLabels(nuevasEtiquetas);
  };

  const handleCreateModel = (e) => {
    e.preventDefault();
    if (!newModelName.trim()) return;
    const etiquetasLimpias = newModelLabels.map(et => et.trim()).filter(et => et !== '');
    if (etiquetasLimpias.length === 0) return;
    const nuevoModelo = {
      id: Date.now(),
      name: newModelName,
      type: newModelType,
      labels: etiquetasLimpias,
      samples: 0,
      progress: 0,
    };
    setModels(prevModels => [...prevModels, nuevoModelo]);
    handleCloseCreateModelModal();
    setCurrentLetter(characterFromURL);
    setSelectedModelId(nuevoModelo.id);
    // Inicializar stats para nuevas etiquetas de este modelo si no existen
    setLabelStats(prev => {
      const nuevoStats = { ...prev };
      etiquetasLimpias.forEach(label => {
        const key = getLabelStatsKey(nuevoModelo.id, label);
        if (!nuevoStats[key]) {
          nuevoStats[key] = { samples: 0, progress: 0, precision: 0 };
        }
      });
      return nuevoStats;
    });
  };

  const handleSelectLabel = (label) => {
    setCurrentLetter(label);
    // Si la etiqueta no tiene stats para este modelo, inicializarlos
    if (selectedModel) {
      const key = getLabelStatsKey(selectedModel.id, label);
      setLabelStats(prev => {
        if (prev[key]) return prev;
        return {
          ...prev,
          [key]: { samples: 0, progress: 0, precision: 0 }
        };
      });
    }
  };

  const handleSelectModel = (modelId) => {
    setSelectedModelId(modelId);
    setCurrentLetter(characterFromURL);
  };

  // Obtener la ruta de la imagen según el carácter
  const getImagePath = (char) => {
    return process.env.PUBLIC_URL + `/img/Letra ${char}.jpg`;
  };

  return (
    <div className="training-container">
      {/* Modal para crear modelo */}
      {showCreateModelModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Crear Nuevo Modelo</h2>
            <form onSubmit={handleCreateModel}>
              <div className="form-group">
                <label>Nombre del modelo</label>
                <input
                  type="text"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  required
                  placeholder=""
                />
              </div>
              <div className="form-group">
                <label>Tipo de modelo</label>
                <select
                  value={newModelType}
                  onChange={(e) => setNewModelType(e.target.value)}
                >
                  <option value="Clasificación">Vocales</option>
                  <option value="Regresión">Numeros</option>
                </select>
              </div>
              <div className="form-group">
                <label>Etiquetas (Letras/Números)</label>
                {newModelLabels.map((label, idx) => (
                  <div key={idx} className="label-input-container">
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => handleLabelChange(idx, e.target.value)}
                      required
                      placeholder={`Etiqueta ${idx + 1}`}
                      className="label-input"
                    />
                    {newModelLabels.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLabel(idx)}
                        className="remove-label-btn"
                        aria-label="Eliminar etiqueta"
                        title="Eliminar etiqueta"
                      >
                        ✖
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddLabel}
                  className="add-label-btn"
                >
                  + Agregar otra etiqueta
                </button>
              </div>
              <div className="modal-actions">
                <button type="submit" className="modal-btn crear">
                  Crear
                </button>
                <button
                  type="button"
                  className="modal-btn cancelar"
                  onClick={handleCloseCreateModelModal}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="training-header">
        <button className="back-button" onClick={handleBackToHome}>
          ← Volver al Inicio
        </button>
        <h1>Entrenar Vocales - {characterFromURL}</h1>
        <button className='NuevoModelo' onClick={handleOpenCreateModelModal}>Crear Modelo</button>
      </div>

      {/* Main Content */}
      <div className="training-content">
        {/* Left Column - Mis Modelos */}

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
                <h3 style={{ marginTop: "2rem", fontSize: "1.7rem", color: "black" }}>Progreso</h3>
                <div className="progress-bar-container" style={{ fontSize: "1.3rem" }}>
                  <div className="progress-bar" style={{ height: "18px" }}>
                    <div className="progress-fill" style={{ width: '100%', height: "18px" }}></div>
                  </div>
                  <span className="progress-percentage" style={{ fontSize: "1.3rem" }}>100%</span>
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
              <DeteccionVocales character={characterFromURL} />
            ) : (
              <div className="camera-placeholder">
                <div className="camera-icon-large">📹</div>
                <p>Cámara no iniciada</p>
                <p className="camera-description">
                  Haz clic en "Iniciar Cámara" para comenzar
                </p>
              </div>
            )}

            {/* Controles de cámara */}
            
          </div>

          {/* Mostrar las etiquetas del modelo seleccionado como botones para seleccionar */}
          <div className="training-controls">
            <h3>
              {selectedModel
                ? `Entrenamiento: ${currentLetter || 'Selecciona una etiqueta'}`
                : 'Selecciona un modelo para entrenar'}
            </h3>
            <div className="etiquetas-disponibles">
              {!selectedModel || modelLabels.length === 0 ? (
                <span className="no-labels-message">
                  {selectedModel
                    ? 'Este modelo no tiene etiquetas'
                    : 'Crea o selecciona un modelo para ver etiquetas aquí'}
                </span>
              ) : (
                modelLabels.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`etiqueta-btn${currentLetter === label ? ' seleccionada' : ''}`}
                    onClick={() => handleSelectLabel(label)}
                  >
                    {label}
                  </button>
                ))
              )}
            </div>
            <div className="current-letter">
              <div className="letter-display">{currentLetter || '?'}</div>
            </div>
            <button
              className="collect-button"
              onClick={handleCollectData}
              disabled={
                !isCameraActive ||
                !currentLetter ||
                samples >= MUESTRAS_OBJETIVO
              }
            >
              Recolectar Datos
            </button>
            {/* Tarjetas de información debajo de Recolectar Datos */}
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
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Total de muestras</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{samples} / {MUESTRAS_OBJETIVO}</div>
              </div>
              <div className="training-card" style={{
                background: '#fff',
                color: '#2D1B69',
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                minWidth: '120px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(45,27,105,0.10)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Precisión</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{precision}%</div>
              </div>
              <div className="training-card" style={{
                background: samples >= MUESTRAS_OBJETIVO ? '#11998E' : '#eee',
                color: samples >= MUESTRAS_OBJETIVO ? '#fff' : '#aaa',
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                minWidth: '120px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(45,27,105,0.10)'
              }}>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Estado</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>
                  {samples >= MUESTRAS_OBJETIVO ? 'Listo' : 'Pendiente'}
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

export default EntrenarVocales;