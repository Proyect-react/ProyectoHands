// src/Components/TrainingPage/PracticePage.jsx
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
        color: '#4CAF50'
    },
    numeros: {
        name: 'Números',
        labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
        color: '#2196F3'
    },
    operaciones: {
        name: 'Operaciones',
        labels: ['+', '-', '*', '/', '='],
        color: '#FF9800'
    },
    palabras: {
        name: 'Palabras',
        labels: ['hola', 'gracias', 'por_favor', 'si', 'no'],
        color: '#9C27B0'
    }
};

const PracticePage = () => {
    const [selectedCategory, setSelectedCategory] = useState('vocales');
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

    // ========== FUNCIÓN DE LIMPIEZA DE MODELOS ==========
    const cleanAvailableModels = useCallback((models) => {
        const seen = new Set();
        return models
            .filter(model => model && model.category) // Filtrar modelos válidos
            .map((model, index) => {
                // Asignar nombre único si no tiene
                const modelName = model.model_name || `modelo_${Date.now()}_${index}`;

                // Evitar duplicados
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
            .filter(model => model !== null); // Remover nulos
    }, []);

    // ========== FUNCIONES DE DESCARGA ==========

    const loadDownloadedModels = useCallback(async (preserveSelection = false) => {
        try {
            await modelDownloadService.loadPersistedModels();

            // 🚨 CORRECCIÓN: Filtrar modelos válidos
            const downloadedModels = modelDownloadService.getDownloadedModels(selectedCategory)
                .filter(model => model && model.model_name && model.category); // Solo modelos con nombre y categoría

            console.log(`📋 Modelos válidos para ${selectedCategory}:`, downloadedModels);

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
                .filter(model => model.category === selectedCategory && model.model_name) // Solo con nombre
                .map(model => ({
                    ...model,
                    source: 'local'
                }));

            const allModels = cleanAvailableModels([...formattedModels, ...localModelsFormatted]);

            console.log(`🎯 Todos los modelos disponibles para ${selectedCategory}:`, allModels);

            setAvailableModels(allModels);

            // 🚨 CORREGIDO: Solo seleccionar automáticamente si no hay preservación de selección
            if (!preserveSelection) {
                if (allModels.length > 0 && !allModels.some(m => m.model_name === selectedModel)) {
                    const firstModel = allModels[0].model_name;
                    console.log(`🔍 Seleccionando primer modelo: ${firstModel}`);
                    setSelectedModel(firstModel);
                } else if (allModels.length === 0) {
                    console.log(`⚠️ No hay modelos disponibles para ${selectedCategory}`);
                    setSelectedModel('');
                }
            } else {
                console.log(`🔒 Preservando selección actual: ${selectedModel}`);
                // Verificar que el modelo seleccionado aún existe
                if (selectedModel && !allModels.some(m => m.model_name === selectedModel)) {
                    console.log(`⚠️ Modelo seleccionado ya no existe, deseleccionando`);
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

            console.log('🔍 Verificando modelos...');

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

            // 🚨 CORREGIDO: Recargar modelos después de la descarga con preservación de selección
            await loadDownloadedModels(preserveSelection);

            console.log('📊 Resultado:', result);

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

    // ========== PREDICCIÓN OPTIMIZADA ==========

    // 🆕 Cache para modelos ya cargados
    const loadedModelsCache = useRef(new Map());

    const predictWithDownloadedModel = useCallback(async (landmarks) => {
        try {
            if (!selectedModel || !selectedCategory) {
                throw new Error('No hay modelo o categoría seleccionada');
            }

            console.log(`🔍 Prediciendo con modelo: ${selectedCategory}/${selectedModel}`);

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
                console.log(`📥 Usando modelo descargado: ${selectedCategory}/${selectedModel}`);

                // 🚨 OPTIMIZACIÓN: Verificar si ya está en cache
                if (!loadedModelsCache.current.has(cacheKey)) {
                    console.log(`🔄 Cargando modelo en cache: ${cacheKey}`);

                    // Cargar modelo solo si no está en cache
                    const modelData = await modelDownloadService.loadModel(selectedCategory, selectedModel);
                    if (!modelData || !modelData.model) {
                        throw new Error('No se pudo cargar el modelo desde IndexedDB');
                    }

                    // Guardar en cache
                    loadedModelsCache.current.set(cacheKey, {
                        model: modelData.model,
                        labels: modelData.labels
                    });
                } else {
                    console.log(`⚡ Usando modelo desde cache: ${cacheKey}`);
                }

                // Obtener del cache
                const cachedModel = loadedModelsCache.current.get(cacheKey);

                // Hacer predicción sin recargar el modelo
                predictions = await modelDownloadService.predictWithModel(
                    cachedModel.model,
                    landmarks
                );
                labels = cachedModel.labels;

            } else {
                console.log(`💾 Usando modelo local: ${selectedCategory}/${selectedModel}`);

                if (!tfjsTrainer.hasModel(selectedCategory, selectedModel)) {
                    // Cargar modelo local si no está en memoria
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
                model_source: selectedModelInfo.source
            };

        } catch (error) {
            console.error('❌ Error en predicción:', error);

            // 🚨 LIMPIAR CACHE EN CASO DE ERROR
            const cacheKey = `${selectedCategory}_${selectedModel}`;
            loadedModelsCache.current.delete(cacheKey);

            return {
                prediction: "Error en modelo",
                confidence: 0,
                percentage: "0",
                high_confidence: false,
                top_3: [],
                error: error.message
            };
        }
    }, [selectedModel, selectedCategory, availableModels]);

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

    // ========== HANDLER DE CÁMARA OPTIMIZADO ==========

    const handleHandDetected = useCallback((landmarksArray, rawLandmarks) => {
        if (!landmarksArray || !selectedModel) return;

        const now = Date.now();
        const handSize = calcularTamanioMano(rawLandmarks);

        // 🚨 OPTIMIZACIÓN: Aumentar el intervalo entre predicciones
        if (handSize >= MIN_HAND_SIZE && now - lastCollectionTime.current > 800) {
            predictWithDownloadedModel(landmarksArray)
                .then(result => {
                    if (result) setPredictionResult(result);
                    lastCollectionTime.current = now;
                })
                .catch(error => {
                    console.error('Error en predicción:', error);
                });
        } else if (handSize < MIN_HAND_SIZE) {
            setPredictionResult({
                prediction: "Acerca tu mano a la cámara",
                percentage: 0,
                high_confidence: false,
                top_3: []
            });
        }
    }, [selectedModel, predictWithDownloadedModel]);

    // ========== HANDLERS DE UI ==========

    const handleStartCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 640,
                    height: 480,
                    facingMode: 'user'
                }
            });

            stream.getTracks().forEach(track => track.stop());
            setIsCameraActive(true);
        } catch (error) {
            console.error('Error solicitando permisos:', error);
            alert(`No se pudo acceder a la cámara:\n${error.message}\n\nVerifica los permisos en tu navegador.`);
        }
    };

    const handleStopCamera = () => {
        setIsCameraActive(false);
        setPredictionResult(null);
    };

    const handleModelChange = (modelName) => {
        console.log(`🎯 Cambiando modelo a: ${modelName}`);

        // 🚨 LIMPIAR CACHE AL CAMBIAR DE MODELO
        loadedModelsCache.current.clear();

        setSelectedModel(modelName);
        setPredictionResult(null);
    };

    const handleCategoryChange = async (newCategory) => {
        console.log(`🔄 Cambiando categoría a: ${newCategory}`);

        // 🚨 LIMPIAR CACHE AL CAMBIAR DE CATEGORÍA
        loadedModelsCache.current.clear();

        setSelectedCategory(newCategory);
        setSelectedModel('');
        setPredictionResult(null);
        await checkAndDownloadModels(newCategory, false);
    };

    // ========== EFECTOS ==========

    useEffect(() => {
        const initializeModels = async () => {
            console.log('🚀 Inicializando modelos...');
            await checkAndDownloadModels(selectedCategory, true); // Preservar selección en inicialización
        };

        initializeModels();
    }, [selectedCategory, checkAndDownloadModels]);

    // 🆕 EFECTO PARA DEBUG: Mostrar modelos disponibles cuando cambian
    useEffect(() => {
        console.log(`🔄 Modelos disponibles actualizados para ${selectedCategory}:`, availableModels);
        console.log(`🎯 Modelo seleccionado actualmente: ${selectedModel}`);
    }, [availableModels, selectedCategory, selectedModel]);

    // ========== RENDER ==========

    return (
        <div className="training-integrated">
            <div className="training-content">
                {/* Panel de Controles */}
                <div className="control-panel">

                    {/* Selector de Categoría */}
                    <div className="category-selector" style={{ marginBottom: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '10px' }}>
                        <h4>Seleccionar Categoría:</h4>
                        <div className="category-buttons" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {Object.entries(categories).map(([key, category]) => (
                                <button
                                    key={key}
                                    className={`category-btn ${selectedCategory === key ? 'selected' : ''}`}
                                    onClick={() => handleCategoryChange(key)}
                                    style={{
                                        background: selectedCategory === key ? category.color : '#e0e0e0',
                                        color: selectedCategory === key ? 'white' : '#333',
                                        border: 'none',
                                        padding: '8px 15px',
                                        borderRadius: '20px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        fontSize: '14px'
                                    }}
                                >
                                    {category.name}
                                </button>
                            ))}
                        </div>
                        <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
                            Categoría actual: <strong>{categories[selectedCategory]?.name}</strong>
                        </p>
                        <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#999' }}>
                            Modelos disponibles: {availableModels.filter(m => m.category === selectedCategory).length}
                        </p>
                    </div>

                    {/* Selector de Modelo - CORREGIDO */}
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
                                    // 🚨 CORRECCIÓN: Generar clave única incluso si model_name es undefined
                                    const modelName = model.model_name || `unnamed_${index}`;
                                    const uniqueKey = `${model.category}_${modelName}_${index}`;

                                    return (
                                        <option key={uniqueKey} value={modelName}>
                                            {modelName} ({model.source === 'downloaded' ? '🔽' : '💾'}) - {model.accuracy}% - {model.samples_used} muestras
                                        </option>
                                    );
                                })
                            }
                        </select>
                        {availableModels.filter(model => model.category === selectedCategory).length === 0 && (
                            <p style={{ fontSize: '12px', color: '#ff9800', marginTop: '5px' }}>
                                ⚠️ No hay modelos disponibles para esta categoría
                            </p>
                        )}
                    </div>

                    {/* Botón para forzar recarga de modelos */}
                    <div style={{ marginBottom: '15px' }}>
                        <button
                            onClick={() => checkAndDownloadModels(selectedCategory, true)} // Preservar selección
                            style={{
                                background: '#2196F3',
                                color: 'white',
                                border: 'none',
                                padding: '8px 12px',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                width: '100%'
                            }}
                        >
                            🔄 Recargar Modelos (Preservar Selección)
                        </button>
                    </div>

                    {/* Botón para limpiar modelos corruptos */}
                    <div style={{ marginBottom: '15px' }}>
                        <button
                            onClick={() => {
                                localStorage.removeItem('modelos-persistidos');
                                sessionStorage.clear();
                                console.log('🧹 Modelos limpiados, recargando...');
                                setTimeout(() => window.location.reload(), 1000);
                            }}
                            style={{
                                background: '#ff9800',
                                color: 'white',
                                border: 'none',
                                padding: '8px 12px',
                                borderRadius: '5px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                width: '100%'
                            }}
                        >
                            🧹 Limpiar Modelos Corruptos
                        </button>
                    </div>

                    {/* Estado de Descarga */}
                    {downloadStatus.checking && (
                        <div style={{
                            padding: '10px',
                            background: '#e3f2fd',
                            borderRadius: '5px',
                            fontSize: '12px',
                            marginBottom: '10px'
                        }}>
                            🔍 {downloadStatus.message}
                        </div>
                    )}

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
                            {isCameraActive ? '📹 Cámara Activa' : '🎥 Iniciar Cámara'}
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
                            🛑 Detener Cámara
                        </button>
                    </div>

                    {/* Resultado de Predicción */}
                    {predictionResult && (
                        <div style={{
                            marginTop: '15px',
                            padding: '15px',
                            background: predictionResult.high_confidence ? '#e8f5e8' : '#fff3e0',
                            borderRadius: '10px',
                            border: `2px solid ${predictionResult.high_confidence ? '#4CAF50' : '#FF9800'}`
                        }}>
                            <div style={{
                                fontSize: '24px',
                                fontWeight: 'bold',
                                textAlign: 'center',
                                marginBottom: '10px',
                                color: predictionResult.high_confidence ? '#2E7D32' : '#FF9800'
                            }}>
                                {predictionResult.prediction}
                            </div>

                            <div style={{
                                fontSize: '16px',
                                textAlign: 'center',
                                marginBottom: '15px',
                                color: '#666'
                            }}>
                                Confianza: {predictionResult.percentage}%
                            </div>

                            {predictionResult.top_3 && predictionResult.top_3.length > 0 && (
                                <div style={{ fontSize: '14px' }}>
                                    <div style={{ fontWeight: '600', marginBottom: '8px' }}>Top 3:</div>
                                    {predictionResult.top_3.map((item, index) => (
                                        <div key={index} style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            padding: '5px 0',
                                            borderBottom: '1px solid #f0f0f0'
                                        }}>
                                            <span>{item.label}</span>
                                            <span>{item.percentage}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{
                                fontSize: '12px',
                                textAlign: 'center',
                                marginTop: '10px',
                                color: '#999'
                            }}>
                                Modelo: {selectedModel} ({predictionResult.model_source})
                            </div>
                        </div>
                    )}

                    {/* Información del Modelo Seleccionado */}
                    {selectedModel && (
                        <div style={{
                            marginTop: '15px',
                            padding: '10px',
                            background: '#e3f2fd',
                            borderRadius: '5px',
                            fontSize: '12px'
                        }}>
                            <div><strong>Modelo:</strong> {selectedModel}</div>
                            <div><strong>Categoría:</strong> {selectedCategory}</div>
                            <div><strong>Fuente:</strong> {
                                availableModels.find(m => m.model_name === selectedModel)?.source === 'downloaded' ?
                                    '🔽 Descargado del Backend' : '💾 Entrenado Localmente'
                            }</div>
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
                            categoryColor={categories[selectedCategory]?.color}
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
                            {/* Indicador de Modo */}
                            <div style={{
                                background: 'rgba(0,0,0,0.7)',
                                color: 'white',
                                padding: '5px 10px',
                                borderRadius: '5px',
                                fontSize: '12px',
                                fontWeight: '600'
                            }}>
                                🎯 PRÁCTICA
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
                                '🎯 Realiza la seña frente a la cámara' :
                                '⏸️ Selecciona un modelo para comenzar'
                            }
                        </div>
                    </div>

                    {/* Información adicional debajo de la cámara */}
                    <div style={{ marginTop: '15px', textAlign: 'center' }}>
                        {predictionResult && (
                            <div style={{
                                padding: '10px',
                                background: predictionResult.high_confidence ? '#e8f5e8' : '#fff3e0',
                                borderRadius: '5px',
                                fontSize: '14px'
                            }}>
                                {predictionResult.high_confidence ? (
                                    <span style={{ color: '#4CAF50', fontWeight: '600' }}>
                                        ✅ Alta confianza: {predictionResult.prediction} ({predictionResult.percentage}%)
                                    </span>
                                ) : (
                                    <span style={{ color: '#FF9800' }}>
                                        ⚠️ Baja confianza: {predictionResult.prediction} ({predictionResult.percentage}%)
                                    </span>
                                )}
                            </div>
                        )}

                        {!selectedModel && (
                            <div style={{
                                padding: '10px',
                                background: '#fff3e0',
                                borderRadius: '5px',
                                fontSize: '14px'
                            }}>
                                <span style={{ color: '#FF9800' }}>
                                    ⚠️ Selecciona un modelo para comenzar a practicar
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PracticePage;