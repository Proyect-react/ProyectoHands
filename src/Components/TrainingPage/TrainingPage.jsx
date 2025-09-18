import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './TrainingPage.css';
import MediapipeHands from '../Camara/camara';

const LOCAL_STORAGE_MODELS_KEY = 'training_models_v1';
const LOCAL_STORAGE_LABELSTATS_KEY = 'training_labelStats_v2'; // Cambiado para evitar conflicto con la versión anterior
const LOCAL_STORAGE_SELECTED_MODEL_KEY = 'training_selectedModelId_v1';

// Utilidad para obtener la clave única de stats por modelo y etiqueta
function getLabelStatsKey(modelId, label) {
  return `${modelId}__${label}`;
}

function TrainingPage() {
  const navigate = useNavigate();

  // Persist models in localStorage
  const [models, setModels] = useState(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_MODELS_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  // Persist labelStats in localStorage (ahora por modelo+etiqueta)
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
  const [currentLetter, setCurrentLetter] = useState('');

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
      setCurrentLetter('');
    }
  }, [models, selectedModelId]);

  // Si se cambia de modelo, limpiar la etiqueta seleccionada
  useEffect(() => {
    setCurrentLetter('');
  }, [selectedModelId]);

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
        setCurrentLetter('');
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

  const handlePauseCamera = () => {
    setIsCameraActive(false);
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
    setCurrentLetter('');
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
    setCurrentLetter('');
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
        <h1>Crea y entrena modelos personalizados</h1>
        <button className='NuevoModelo' onClick={handleOpenCreateModelModal}>Crear Modelo</button>
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
              <div
                key={model.id}
                className={`model-card${selectedModelId === model.id ? ' selected-model' : ''}`}
                style={{
                  border: selectedModelId === model.id ? '2px solid #2D1B69' : undefined,
                  boxShadow: selectedModelId === model.id ? '0 0 8px #2D1B6933' : undefined,
                  cursor: 'pointer'
                }}
                onClick={() => handleSelectModel(model.id)}
              >
                <div className="model-header">
                  <h3>{model.name}</h3>
                  <button
                    className="delete-button"
                    onClick={e => {
                      e.stopPropagation();
                      handleDeleteModel(model.id);
                    }}
                  >
                    🗑️
                  </button>
                </div>
                <div className="model-info">
                  <p>
                    <strong>Tipo:</strong> {model.type} •{' '}
                    {Array.isArray(model.labels)
                      ? `${model.labels.length} etiquetas`
                      : `${model.labels} etiquetas`}
                  </p>
                  <p><strong>Muestras:</strong> {model.samples || 0} muestras</p>
                  {Array.isArray(model.labels) && model.labels.length > 0 && (
                    <div className="model-labels-info">
                      <strong>Etiquetas:</strong> {model.labels.join(', ')}
                    </div>
                  )}
                </div>
                <div className="model-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${model.progress || 0}%` }}></div>
                  </div>
                  <span className="progress-text">{model.progress || 0}%</span>
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
            {isCameraActive ? (
              <MediapipeHands />
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

export default TrainingPage;
