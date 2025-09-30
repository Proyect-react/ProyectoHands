// src/Components/TrainingPage/Practica.jsx - REESTRUCTURADA
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
        labels: ['+', '-', '*', '/', '='],
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
    // Estados de navegación
    const [currentView, setCurrentView] = useState('categories'); // 'categories', 'labels', 'practice'
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedLabel, setSelectedLabel] = useState(null);
    const [selectedModel, setSelectedModel] = useState('');

    // Estados de práctica
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

    // ========== FUNCIONES DE LIMPIEZA ==========
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

    // ========== FUNCIONES DE DESCARGA ==========
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
                .map(model => ({
                    ...model,
                    source: 'local'
                }));

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
            setDownloadStatus(prev => ({
                ...prev,
                checking: true,
                message: 'Verificando modelos disponibles...'
            }));

            const result = await modelDownloadService.checkAndDownloadModels(category);

            setDownloadStatus(prev => ({
                ...prev,
                checking: false,
                downloading: false,
                downloadedModels: result.downloaded,
                errors: result.errors,
                message: result.downloaded.length > 0
                    ? `✅ ${result.downloaded.length} modelos descargados`
                    : result.errors.length > 0
                        ? `⚠️ ${result.errors.length} errores en descarga`
                        : '✅ Todos los modelos actualizados'
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

    // ========== PREDICCIÓN ==========
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
                predictions = await modelDownloadService.predictWithModel(
                    cachedModel.model,
                    landmarks
                );
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

            // Filtrar para mostrar solo la etiqueta que estamos practicando
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
                // Info específica para la etiqueta que practicamos
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

    // ========== HANDLER DE CÁMARA ==========
    const handleHandDetected = useCallback((landmarksArray, rawLandmarks) => {
        if (!landmarksArray || !selectedModel) {
            // Limpiar si no hay landmarks o modelo
            setPredictionResult(null);
            return;
        }

        const now = Date.now();
        const handSize = calcularTamanioMano(rawLandmarks);

        // Si la mano es muy pequeña o no hay mano, limpiar resultado
        if (handSize < MIN_HAND_SIZE) {
            setPredictionResult(null);
            return;
        }

        // Solo hacer predicción si ha pasado suficiente tiempo
        if (now - lastCollectionTime.current > 1500) {
            predictWithDownloadedModel(landmarksArray)
                .then(result => {
                    // Solo mostrar resultado si detectó la letra que estamos practicando
                    if (result && result.prediction === selectedLabel) {
                        setPredictionResult(result);
                    } else {
                        // Limpiar si detectó otra letra
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

    // ========== HANDLERS DE NAVEGACIÓN ==========
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

    // ========== HANDLERS DE CÁMARA ==========
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

    // ========== EFECTOS ==========
    useEffect(() => {
        if (selectedCategory) {
            checkAndDownloadModels(selectedCategory, true);
        }
    }, [selectedCategory, checkAndDownloadModels]);

    // ========== RENDER: VISTA DE CATEGORÍAS ==========
    const renderCategoriesView = () => (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '30px', fontSize: '28px' }}>
                📚 Selecciona una Categoría para Practicar
            </h2>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '20px',
                marginTop: '20px'
            }}>
                {Object.entries(categories).map(([key, category]) => (
                    <div
                        key={key}
                        onClick={() => handleSelectCategory(key)}
                        style={{
                            background: 'white',
                            borderRadius: '12px',
                            padding: '30px',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            textAlign: 'center',
                            border: `3px solid ${category.color}`,
                            ':hover': {
                                transform: 'translateY(-5px)',
                                boxShadow: '0 6px 12px rgba(0,0,0,0.15)'
                            }
                        }}
                    >
                        <div style={{ fontSize: '48px', marginBottom: '15px' }}>
                            {category.icon}
                        </div>
                        <h3 style={{
                            color: category.color,
                            fontSize: '24px',
                            marginBottom: '10px',
                            fontWeight: 'bold'
                        }}>
                            {category.name}
                        </h3>
                        <p style={{ color: '#666', fontSize: '14px', marginBottom: '15px' }}>
                            {category.description}
                        </p>
                        <div style={{
                            background: category.color,
                            color: 'white',
                            padding: '8px 16px',
                            borderRadius: '20px',
                            fontSize: '14px',
                            fontWeight: '600',
                            display: 'inline-block'
                        }}>
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
            <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
                <button
                    onClick={handleBackToCategories}
                    style={{
                        background: '#666',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        marginBottom: '20px',
                        fontSize: '14px'
                    }}
                >
                    ← Volver a Categorías
                </button>

                <h2 style={{
                    textAlign: 'center',
                    marginBottom: '30px',
                    fontSize: '28px',
                    color: category.color
                }}>
                    {category.icon} {category.name}
                </h2>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '15px',
                    marginTop: '20px'
                }}>
                    {category.labels.map(label => (
                        <div
                            key={label}
                            onClick={() => handleSelectLabel(label)}
                            style={{
                                background: 'white',
                                borderRadius: '12px',
                                padding: '30px',
                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                textAlign: 'center',
                                border: `3px solid ${category.color}`,
                                ':hover': {
                                    transform: 'translateY(-5px)',
                                    boxShadow: '0 6px 12px rgba(0,0,0,0.15)'
                                }
                            }}
                        >
                            <div style={{
                                fontSize: '48px',
                                fontWeight: 'bold',
                                color: category.color,
                                marginBottom: '10px'
                            }}>
                                {label}
                            </div>
                            <div style={{
                                fontSize: '14px',
                                color: '#666',
                                fontWeight: '600'
                            }}>
                                Practicar
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // ========== RENDER: VISTA DE PRÁCTICA ==========
    const renderPracticeView = () => {
        const category = categories[selectedCategory];

        return (
            <div className="training-content">
                {/* Panel izquierdo - Controles */}
                <div className="control-panel">
                    <button
                        onClick={handleBackToLabels}
                        style={{
                            background: '#666',
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            marginBottom: '20px',
                            fontSize: '14px',
                            width: '100%'
                        }}
                    >
                        ← Volver a {category.name}
                    </button>

                    <div style={{
                        background: category.color,
                        color: 'white',
                        padding: '20px',
                        borderRadius: '10px',
                        textAlign: 'center',
                        marginBottom: '20px'
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '10px' }}>
                            {selectedLabel}
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                            Practicando: {selectedLabel}
                        </div>
                    </div>

                    {/* Selector de Modelo */}
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                            Seleccionar Modelo:
                        </label>
                        <select
                            value={selectedModel}
                            onChange={(e) => handleModelChange(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '5px',
                                border: '1px solid #ccc',
                                fontSize: '14px'
                            }}
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

                    {/* Controles de Cámara */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                        <button
                            onClick={handleStartCamera}
                            disabled={isCameraActive || !selectedModel}
                            style={{
                                background: isCameraActive ? '#ccc' : (!selectedModel ? '#ccc' : '#4CAF50'),
                                color: 'white',
                                border: 'none',
                                padding: '10px 15px',
                                borderRadius: '5px',
                                cursor: (!selectedModel || isCameraActive) ? 'not-allowed' : 'pointer',
                                flex: 1
                            }}
                        >
                            {isCameraActive ? '📹 Activa' : '🎥 Iniciar'}
                        </button>

                        <button
                            onClick={handleStopCamera}
                            disabled={!isCameraActive}
                            style={{
                                background: !isCameraActive ? '#ccc' : '#f44336',
                                color: 'white',
                                border: 'none',
                                padding: '10px 15px',
                                borderRadius: '5px',
                                cursor: !isCameraActive ? 'not-allowed' : 'pointer',
                                flex: 1
                            }}
                        >
                            🛑 Detener
                        </button>
                    </div>

                    {/* Resultado de Predicción */}
                    {predictionResult && (
                        <div style={{
                            marginTop: '15px',
                            padding: '15px',
                            background: predictionResult.is_correct ? '#e8f5e8' : '#ffebee',
                            borderRadius: '10px',
                            border: `2px solid ${predictionResult.is_correct ? '#4CAF50' : '#f44336'}`
                        }}>
                            <div style={{
                                fontSize: '24px',
                                fontWeight: 'bold',
                                textAlign: 'center',
                                marginBottom: '10px',
                                color: predictionResult.is_correct ? '#2E7D32' : '#c62828'
                            }}>
                                {predictionResult.is_correct ? '✅ ¡CORRECTO!' : '❌ Incorrecto'}
                            </div>

                            <div style={{
                                fontSize: '18px',
                                textAlign: 'center',
                                marginBottom: '10px',
                                color: '#666'
                            }}>
                                Detectado: <strong>{predictionResult.prediction}</strong>
                            </div>

                            <div style={{
                                fontSize: '14px',
                                textAlign: 'center',
                                marginBottom: '15px',
                                color: '#666'
                            }}>
                                Confianza en "{selectedLabel}": {predictionResult.target_percentage}%
                            </div>
                        </div>
                    )}
                </div>

                {/* Panel derecho - Cámara */}
                <div className="camera-panel">
                    <div style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: '640px',
                        margin: '0 auto',
                        background: '#000',
                        borderRadius: '10px',
                        overflow: 'hidden'
                    }}>
                        <MediaPipeCamera
                            isActive={isCameraActive}
                            onHandDetected={handleHandDetected}
                            categoryColor={category.color}
                            width={640}
                            height={480}
                        />

                        {/* Overlay de información */}
                        <div style={{
                            position: 'absolute',
                            top: '10px',
                            left: '10px',
                            right: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start'
                        }}>
                            <div style={{
                                background: 'rgba(0,0,0,0.7)',
                                color: 'white',
                                padding: '5px 10px',
                                borderRadius: '5px',
                                fontSize: '12px',
                                fontWeight: '600'
                            }}>
                                🎯 PRACTICANDO: {selectedLabel}
                            </div>

                            {selectedModel && (
                                <div style={{
                                    background: 'rgba(0,0,0,0.7)',
                                    color: 'white',
                                    padding: '5px 10px',
                                    borderRadius: '5px',
                                    fontSize: '12px'
                                }}>
                                    MODELO: {selectedModel}
                                </div>
                            )}
                        </div>

                        {/* Instrucciones */}
                        <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '10px',
                            right: '10px',
                            background: 'rgba(0,0,0,0.7)',
                            color: 'white',
                            padding: '8px',
                            borderRadius: '5px',
                            fontSize: '12px',
                            textAlign: 'center'
                        }}>
                            {selectedModel ?
                                `🎯 Realiza la seña de "${selectedLabel}" frente a la cámara` :
                                '⏸️ Selecciona un modelo para comenzar'
                            }
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ========== RENDER PRINCIPAL ==========
    return (
        <div className="training-integrated">
            {currentView === 'categories' && renderCategoriesView()}
            {currentView === 'labels' && renderLabelsView()}
            {currentView === 'practice' && renderPracticeView()}
        </div>
    );
};

export default PracticePage;