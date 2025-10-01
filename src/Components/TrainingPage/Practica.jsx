// src/Components/TrainingPage/Practica.jsx - CON IMÁGENES DE SEÑAS
import React, { useState, useEffect, useCallback, useRef } from 'react';
import modelDownloadService from '../../services/modelDownloadService';
import tfjsTrainer from '../../services/tfjsTrainer';
import MediaPipeCamera from '../Camara/MediaPipeCamera';
import './TrainingPage.css';

const MIN_HAND_SIZE = 0.17;

const categories = {
    vocales: {
        name: 'Vocales',
        labels: ['A', 'E', 'I', 'O', 'U'],
        color: '#4CAF50',
        icon: '🔤',
        description: 'Aprende las 5 vocales'
    },
    numeros: {
        name: 'Números',
        labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
        color: '#2196F3',
        icon: '🔢',
        description: 'Practica números del 0 al 9'
    },
    operaciones: {
        name: 'Operaciones',
        labels: ['+', '-', '*', '÷', '='],
        filenames: { // 🆕 MAPEO DE NOMBRES DE ARCHIVO
            '+': 'suma',
            '-': 'resta', 
            '*': 'multiplicacion',
            '÷': 'division',
            '=': 'igual'
        },
        color: '#FF9800',
        icon: '➕',
        description: 'Símbolos matemáticos básicos'
    },
    palabras: {
        name: 'Palabras',
        labels: ['hola', 'gracias', 'por_favor', 'si', 'no'],
        color: '#9C27B0',
        icon: '💬',
        description: 'Palabras esenciales'
    }
};

const PracticePage = () => {
    const [currentView, setCurrentView] = useState('categories');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedLabel, setSelectedLabel] = useState(null);
    const [selectedModel, setSelectedModel] = useState('');
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [predictionResult, setPredictionResult] = useState(null);
    const [availableModels, setAvailableModels] = useState([]);
    const [downloadStatus, setDownloadStatus] = useState({
        checking: false,
        downloading: false,
        progress: 0,
        message: '',
        downloadedModels: [],
        errors: []
    });

    const lastCollectionTime = useRef(0);
    const loadedModelsCache = useRef(new Map());

    // 🆕 FUNCIÓN PARA OBTENER EL NOMBRE DEL ARCHIVO
    const getImageFileName = useCallback((categoryKey, label) => {
        const category = categories[categoryKey];
        if (!category) return label;
        
        // Si existe mapeo de nombres de archivo, usarlo
        if (category.filenames && category.filenames[label]) {
            return category.filenames[label];
        }
        
        // Si no, usar el label directamente
        return label;
    }, []);

    const cleanAvailableModels = useCallback((models) => {
        const seen = new Set();
        return models
            .filter(model => model && model.category)
            .map((model, index) => {
                const modelName = model.model_name || `modelo_${Date.now()}_${index}`;
                const uniqueKey = `${model.category}_${modelName}`;
                if (seen.has(uniqueKey)) {
                    return null;
                }
                seen.add(uniqueKey);
                return {
                    ...model,
                    model_name: modelName,
                    accuracy: model.accuracy || 0,
                    samples_used: model.samples_used || 0
                };
            })
            .filter(model => model !== null);
    }, []);

    const loadDownloadedModels = useCallback(async (preserveSelection = false) => {
        try {
            await modelDownloadService.loadPersistedModels();
            const downloadedModels = modelDownloadService.getDownloadedModels(selectedCategory)
                .filter(model => model && model.model_name && model.category);
            const formattedModels = downloadedModels.map(model => ({
                model_name: model.model_name,
                accuracy: model.accuracy || 0,
                samples_used: model.samples_used || 0,
                category: model.category,
                training_date: model.training_date,
                labels: model.labels || [],
                ready_for_prediction: true,
                source: 'downloaded'
            }));
            const localModels = await tfjsTrainer.getLocalModels(selectedCategory);
            const localModelsFormatted = localModels
                .filter(model => model.category === selectedCategory && model.model_name)
                .map(model => ({ ...model, source: 'local' }));
            const allModels = cleanAvailableModels([...formattedModels, ...localModelsFormatted]);
            setAvailableModels(allModels);

            if (!preserveSelection) {
                if (allModels.length > 0 && !allModels.some(m => m.model_name === selectedModel)) {
                    const firstModel = allModels[0].model_name;
                    setSelectedModel(firstModel);
                } else if (allModels.length === 0) {
                    setSelectedModel('');
                }
            } else {
                if (selectedModel && !allModels.some(m => m.model_name === selectedModel)) {
                    setSelectedModel('');
                }
            }
        } catch (error) {
            console.error('❌ Error cargando modelos:', error);
            setAvailableModels([]);
        }
    }, [selectedCategory, selectedModel, cleanAvailableModels]);

    const checkAndDownloadModels = useCallback(async (category = null, preserveSelection = false) => {
        try {
            setDownloadStatus(prev => ({ ...prev, checking: true, message: 'Verificando modelos disponibles...' }));
            const result = await modelDownloadService.checkAndDownloadModels(category);
            setDownloadStatus(prev => ({
                ...prev,
                checking: false,
                downloading: false,
                downloadedModels: result.downloaded,
                errors: result.errors,
                message: result.downloaded.length > 0 ? `✅ ${result.downloaded.length} modelos descargados` :
                    result.errors.length > 0 ? `⚠️ ${result.errors.length} errores en descarga` : '✅ Todos los modelos actualizados'
            }));
            await loadDownloadedModels(preserveSelection);
            return result;
        } catch (error) {
            console.error('❌ Error en verificación:', error);
            setDownloadStatus(prev => ({
                ...prev,
                checking: false,
                downloading: false,
                message: `❌ Error: ${error.message}`,
                errors: [{ error: error.message }]
            }));
        }
    }, [loadDownloadedModels]);

    const predictWithDownloadedModel = useCallback(async (landmarks) => {
        try {
            if (!selectedModel || !selectedCategory) {
                throw new Error('No hay modelo o categoría seleccionada');
            }
            const selectedModelInfo = availableModels.find(m =>
                m.model_name === selectedModel && m.category === selectedCategory
            );
            if (!selectedModelInfo) {
                throw new Error(`Modelo ${selectedModel} no encontrado en categoría ${selectedCategory}`);
            }

            let predictions;
            let labels;
            const cacheKey = `${selectedCategory}_${selectedModel}`;

            if (selectedModelInfo.source === 'downloaded') {
                if (!loadedModelsCache.current.has(cacheKey)) {
                    const modelData = await modelDownloadService.loadModel(selectedCategory, selectedModel);
                    if (!modelData || !modelData.model) {
                        throw new Error('No se pudo cargar el modelo desde IndexedDB');
                    }
                    loadedModelsCache.current.set(cacheKey, {
                        model: modelData.model,
                        labels: modelData.labels
                    });
                }
                const cachedModel = loadedModelsCache.current.get(cacheKey);
                predictions = await modelDownloadService.predictWithModel(cachedModel.model, landmarks);
                labels = cachedModel.labels;
            } else {
                if (!tfjsTrainer.hasModel(selectedCategory, selectedModel)) {
                    await tfjsTrainer.loadModel(selectedCategory, selectedModel);
                }
                predictions = await tfjsTrainer.predict(selectedCategory, selectedModel, landmarks);
                labels = await tfjsTrainer.getModelLabels(selectedCategory, selectedModel);
            }

            if (!predictions || !Array.isArray(predictions)) {
                throw new Error('La predicción no devolvió resultados válidos');
            }

            const maxConfidence = Math.max(...predictions);
            const predictedIndex = predictions.indexOf(maxConfidence);
            const predictedLabel = labels && labels[predictedIndex] ? labels[predictedIndex] : 'Desconocido';
            const targetLabelIndex = labels.indexOf(selectedLabel);
            const targetConfidence = targetLabelIndex >= 0 ? predictions[targetLabelIndex] : 0;
            const ranking = predictions.map((confidence, index) => ({
                label: labels && labels[index] ? labels[index] : `Etiqueta ${index}`,
                confidence: confidence,
                percentage: (confidence * 100).toFixed(1)
            })).sort((a, b) => b.confidence - a.confidence).slice(0, 3);

            return {
                prediction: predictedLabel,
                confidence: maxConfidence,
                percentage: (maxConfidence * 100).toFixed(1),
                high_confidence: maxConfidence > 0.7,
                top_3: ranking,
                model_source: selectedModelInfo.source,
                target_label: selectedLabel,
                target_confidence: targetConfidence,
                target_percentage: (targetConfidence * 100).toFixed(1),
                is_correct: predictedLabel === selectedLabel
            };
        } catch (error) {
            console.error('❌ Error en predicción:', error);
            const cacheKey = `${selectedCategory}_${selectedModel}`;
            loadedModelsCache.current.delete(cacheKey);
            return {
                prediction: "Error en modelo",
                confidence: 0,
                percentage: "0",
                high_confidence: false,
                top_3: [],
                error: error.message,
                is_correct: false
            };
        }
    }, [selectedModel, selectedCategory, selectedLabel, availableModels]);

    const calcularTamanioMano = (landmarks) => {
        if (!landmarks || landmarks.length === 0) return 0;
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        for (const punto of landmarks) {
            if (punto.x < minX) minX = punto.x;
            if (punto.x > maxX) maxX = punto.x;
            if (punto.y < minY) minY = punto.y;
            if (punto.y > maxY) maxY = punto.y;
        }
        return maxX - minX;
    };

    const handleHandDetected = useCallback((landmarksArray, rawLandmarks, handsCount = 1) => {
        if (!landmarksArray || !selectedModel) {
            setPredictionResult(null);
            return;
        }
        const now = Date.now();
        
        // Palabras que requieren dos manos
        const twoHandSigns = ['gracias'];
        const requiresTwoHands = twoHandSigns.includes(selectedLabel);
        
        // Validar cantidad de manos requeridas
        if (requiresTwoHands && handsCount < 2) {
            setPredictionResult({
                prediction: "Se requieren 2 manos",
                confidence: 0,
                percentage: "0",
                high_confidence: false,
                top_3: [],
                is_correct: false,
                warning: `La seña "${selectedLabel}" requiere usar ambas manos`
            });
            return;
        }
        
        const handSize = calcularTamanioMano(rawLandmarks);
        if (handSize < MIN_HAND_SIZE) {
            setPredictionResult(null);
            return;
        }
        
        if (now - lastCollectionTime.current > 1500) {
            predictWithDownloadedModel(landmarksArray)
                .then(result => {
                    if (result && result.prediction === selectedLabel) {
                        setPredictionResult(result);
                    } else {
                        setPredictionResult(null);
                    }
                    lastCollectionTime.current = now;
                })
                .catch(error => {
                    console.error('Error en predicción:', error);
                    setPredictionResult(null);
                });
        }
    }, [selectedModel, selectedLabel, predictWithDownloadedModel]);

    const handleSelectCategory = async (categoryKey) => {
        setSelectedCategory(categoryKey);
        setSelectedLabel(null);
        setSelectedModel('');
        setPredictionResult(null);
        setIsCameraActive(false);
        loadedModelsCache.current.clear();
        await checkAndDownloadModels(categoryKey, false);
        setCurrentView('labels');
    };

    const handleSelectLabel = (label) => {
        setSelectedLabel(label);
        setPredictionResult(null);
        setCurrentView('practice');
    };

    const handleBackToCategories = () => {
        setCurrentView('categories');
        setSelectedCategory(null);
        setSelectedLabel(null);
        setSelectedModel('');
        setIsCameraActive(false);
        setPredictionResult(null);
        loadedModelsCache.current.clear();
    };

    const handleBackToLabels = () => {
        setCurrentView('labels');
        setSelectedLabel(null);
        setIsCameraActive(false);
        setPredictionResult(null);
    };

    const handleStartCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' }
            });
            stream.getTracks().forEach(track => track.stop());
            setIsCameraActive(true);
        } catch (error) {
            console.error('Error solicitando permisos:', error);
            alert(`No se pudo acceder a la cámara:\n${error.message}`);
        }
    };

    const handleStopCamera = () => {
        setIsCameraActive(false);
        setPredictionResult(null);
    };

    const handleModelChange = (modelName) => {
        loadedModelsCache.current.clear();
        setSelectedModel(modelName);
        setPredictionResult(null);
    };

    useEffect(() => {
        if (selectedCategory) {
            checkAndDownloadModels(selectedCategory, true);
        }
    }, [selectedCategory, checkAndDownloadModels]);

    // ========== RENDER: VISTA DE CATEGORÍAS ==========
    const renderCategoriesView = () => (
        <div className="practice-main-container">
            <h2 className="practice-header-title">
                📚 Selecciona una Categoría para Practicar
            </h2>
            <div className="practice-categories-grid">
                {Object.entries(categories).map(([key, category]) => (
                    <div
                        key={key}
                        onClick={() => handleSelectCategory(key)}
                        className="practice-category-card"
                        style={{ border: `3px solid ${category.color}` }}
                    >
                        <div className="practice-category-icon">{category.icon}</div>
                        <h3 className="practice-category-name" style={{ color: category.color }}>
                            {category.name}
                        </h3>
                        <p className="practice-category-desc">{category.description}</p>
                        <div className="practice-category-badge" style={{ background: category.color }}>
                            {category.labels.length} elementos
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    // ========== RENDER: VISTA DE ETIQUETAS ==========
    const renderLabelsView = () => {
        const category = categories[selectedCategory];
        return (
            <div className="practice-labels-container">
                <button onClick={handleBackToCategories} className="practice-back-button">
                    ← Volver a Categorías
                </button>
                <h2 className="practice-labels-title" style={{ color: category.color }}>
                    {category.icon} {category.name}
                </h2>
                <div className="practice-labels-grid">
                    {category.labels.map(label => (
                        <div
                            key={label}
                            onClick={() => handleSelectLabel(label)}
                            className="practice-label-item"
                            style={{ border: `3px solid ${category.color}` }}
                        >
                            <div className="practice-label-char" style={{ color: category.color }}>
                                {label}
                            </div>
                            <div className="practice-label-action-text">Practicar</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // ========== RENDER: VISTA DE PRÁCTICA ==========
    const renderPracticeView = () => {
        const category = categories[selectedCategory];
        // 🆕 OBTENER NOMBRE DEL ARCHIVO USANDO LA FUNCIÓN
        const imageFileName = getImageFileName(selectedCategory, selectedLabel);
        
        return (
            <div className="training-content">
                <div className="control-panel">
                    <button onClick={handleBackToLabels} className="practice-back-button" style={{ width: '100%' }}>
                        ← Volver a {category.name}
                    </button>

                    <div className="practice-active-label-badge" style={{ background: category.color, color: 'white' }}>
                        <div className="practice-active-label-char">{selectedLabel}</div>
                        <div className="practice-active-label-text">Practicando: {selectedLabel}</div>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label className="practice-model-selector-label">Seleccionar Modelo:</label>
                        <select
                            value={selectedModel}
                            onChange={(e) => handleModelChange(e.target.value)}
                            className="practice-model-selector"
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                border: `2px solid ${category.color}`,
                                fontSize: '1rem',
                                background: 'linear-gradient(135deg, #f5fafd 0%, #e3f0fa 100%)',
                                color: '#0A4174',
                                fontWeight: 600,
                                marginTop: '8px',
                                marginBottom: '8px',
                                outline: 'none',
                                boxShadow: '0 2px 8px rgba(0,29,57,0.05)',
                                transition: 'border 0.3s, box-shadow 0.3s'
                            }}
                            onFocus={e => e.target.style.border = `2.5px solid ${category.color}`}
                            onBlur={e => e.target.style.border = `2px solid ${category.color}`}
                        >
                            <option value="">-- Selecciona un modelo --</option>
                            {availableModels
                                .filter(model => model.category === selectedCategory)
                                .map((model, index) => {
                                    const modelName = model.model_name || `unnamed_${index}`;
                                    const uniqueKey = `${model.category}_${modelName}_${index}`;
                                    return (
                                        <option key={uniqueKey} value={modelName}>
                                            {modelName} ({model.source === 'downloaded' ? '🔽' : '💾'}) - {model.accuracy}%
                                        </option>
                                    );
                                })
                            }
                        </select>
                    </div>

                    <div className="practice-camera-controls">
                        <button
                            onClick={handleStartCamera}
                            disabled={isCameraActive || !selectedModel}
                            className={`practice-camera-btn ${isCameraActive ? 'practice-camera-btn-active' : (!selectedModel ? 'practice-camera-btn-active' : 'practice-camera-btn-start')}`}
                        >
                            {isCameraActive ? '📹 Activa' : '🎥 Iniciar'}
                        </button>
                        <button
                            onClick={handleStopCamera}
                            disabled={!isCameraActive}
                            className={`practice-camera-btn ${!isCameraActive ? 'practice-camera-btn-active' : 'practice-camera-btn-stop'}`}
                        >
                            🛑 Detener
                        </button>
                    </div>

                    {/* SECCIÓN DE IMAGEN DE REFERENCIA - ACTUALIZADA */}
                    <div style={{
                        marginTop: '20px',
                        padding: '15px',
                        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                        borderRadius: '12px',
                        border: `2px solid ${category.color}`,
                        textAlign: 'center'
                    }}>
                        <h4 style={{
                            margin: '0 0 12px 0',
                            color: category.color,
                            fontSize: '1.1rem',
                            fontWeight: 'bold'
                        }}>
                            📖 Seña de Referencia
                        </h4>
                        <div style={{
                            background: 'white',
                            borderRadius: '8px',
                            padding: '10px',
                            minHeight: '200px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: `1px solid ${category.color}30`,
                            position: 'relative'
                        }}>
                            <img
                                src={`/img/${selectedCategory}/${imageFileName}.jpg`}
                                alt={`Seña de ${selectedLabel}`}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '250px',
                                    objectFit: 'contain',
                                    borderRadius: '4px'
                                }}
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextElementSibling.style.display = 'flex';
                                }}
                            />
                            <div style={{
                                display: 'none',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '10px',
                                color: '#6c757d'
                            }}>
                                <div style={{ fontSize: '48px' }}>✋</div>
                                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                    Imagen no disponible para: <strong>{selectedLabel}</strong>
                                </p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#adb5bd' }}>
                                    Archivo buscado: {imageFileName}.jpg
                                </p>
                            </div>
                        </div>
                        <p style={{
                            margin: '10px 0 0 0',
                            fontSize: '0.85rem',
                            color: '#6c757d',
                            fontStyle: 'italic'
                        }}>
                            Imita esta seña frente a la cámara
                        </p>
                    </div>
                        
                </div>

                <div className="camera-panel">
                    <div className="practice-camera-wrapper">
                        <MediaPipeCamera
                            isActive={isCameraActive}
                            onHandDetected={handleHandDetected}
                            categoryColor={category.color}
                            width={640}
                            height={480}
                        />

                        <div className="practice-camera-overlay-top">
                            <div className="practice-camera-badge">
                                🎯 PRACTICANDO: {selectedLabel}
                            </div>
                            {selectedModel && (
                                <div className="practice-camera-model-badge">
                                </div>
                            )}
                        </div>

                        <div className="practice-camera-instructions">
                            {selectedModel ?
                                `🎯 Realiza la seña de "${selectedLabel}" frente a la cámara` :
                                '⏸️ Selecciona un modelo para comenzar'
                            }
                        </div>
                    </div>
                    {predictionResult && (
                        <div className={`practice-prediction-box ${predictionResult.is_correct ? 'practice-prediction-correct' : 'practice-prediction-incorrect'}`}>
                            <div className={`practice-prediction-status ${predictionResult.is_correct ? 'practice-prediction-status-correct' : 'practice-prediction-status-incorrect'}`}>
                                {predictionResult.is_correct ? '✅ ¡CORRECTO!' : '❌ Incorrecto'}
                            </div>
                            <div className="practice-prediction-detected">
                                Detectado: <strong>{predictionResult.prediction}</strong>
                            </div>
                            <div className="practice-prediction-confidence">
                                Confianza en "{selectedLabel}": {predictionResult.target_percentage}%
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="training-integrated">
            {currentView === 'categories' && renderCategoriesView()}
            {currentView === 'labels' && renderLabelsView()}
            {currentView === 'practice' && renderPracticeView()}
        </div>
    );
};

export default PracticePage;