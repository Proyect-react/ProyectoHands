// src/Components/TrainingPage/Entrenamiento.jsx - CON GESTIÓN DE MODELOS
import React, { useState, useEffect, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import apiService from '../../services/apiService';
import modelDownloadService from '../../services/modelDownloadService';
import tfjsTrainer from '../../services/tfjsTrainer';
import './TrainingPage.css';

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

const TrainPage = () => {
    const [selectedCategory, setSelectedCategory] = useState('vocales');
    const [modelName, setModelName] = useState("modelo_local");
    const [epochs, setEpochs] = useState(50);
    const [trainingProgress, setTrainingProgress] = useState(null);
    const [datasetStatus, setDatasetStatus] = useState({});
    const [availableModels, setAvailableModels] = useState([]);
    const [downloadStatus, setDownloadStatus] = useState({
        checking: false,
        downloading: false,
        progress: 0,
        message: '',
        downloadedModels: [],
        errors: []
    });

    // ========== FUNCIONES DE GESTIÓN DE MODELOS ==========

    const loadAvailableModels = async (category) => {
        try {
            console.log('📋 Cargando modelos disponibles para', category);

            // Cargar modelos persistidos
            await modelDownloadService.loadPersistedModels();

            // Obtener modelos descargados del backend
            const downloadedModels = modelDownloadService.getDownloadedModels(category)
                .filter(model =>
                    model &&
                    model.model_name &&
                    model.category &&
                    model.category === category
                );

            console.log(`🔽 Backend - Modelos para "${category}":`, downloadedModels.length, downloadedModels);

            const formattedDownloadedModels = downloadedModels.map(model => ({
                model_name: model.model_name,
                accuracy: model.accuracy || 0,
                samples_used: model.samples_used || 0,
                category: model.category,
                training_date: model.training_date,
                labels: model.labels || [],
                source: 'backend'
            }));

            // Obtener modelos locales
            const localModels = await tfjsTrainer.getLocalModels(category);

            const formattedLocalModels = localModels
                .filter(model =>
                    model.category === category &&
                    model.model_name
                )
                .map(model => ({
                    ...model,
                    source: 'local'
                }));

            // Combinar modelos
            const allModels = [...formattedDownloadedModels, ...formattedLocalModels];


            // Eliminar duplicados
            const modelMap = new Map();

            allModels.forEach(model => {
                const key = `${model.category}_${model.model_name}`;
                const existing = modelMap.get(key);

                if (!existing || (model.source === 'backend' && existing.source === 'local')) {
                    modelMap.set(key, model);
                }
            });

            const uniqueModels = Array.from(modelMap.values());

            console.log(`✅ Modelos únicos para "${category}":`, uniqueModels.length);

            // Ordenar por fecha
            uniqueModels.sort((a, b) => {
                const dateA = new Date(a.training_date || 0);
                const dateB = new Date(b.training_date || 0);
                return dateB - dateA;
            });

            setAvailableModels(uniqueModels);
            return uniqueModels;

        } catch (error) {
            console.error('❌ Error cargando modelos:', error);
            setAvailableModels([]);
            return [];
        }
    };

    const handleDeleteModel = async (modelName, source) => {
        const confirmDelete = window.confirm(
            `¿Estás seguro de que quieres eliminar el modelo "${modelName}"?\n\n` +
            `Categoría: ${selectedCategory}\n` +
            `Origen: ${source === 'backend' ? 'Servidor' : 'Local'}\n\n` +
            `Esta acción no se puede deshacer.`
        );

        if (!confirmDelete) return;

        try {

            if (source === 'local') {
                // ========== ELIMINAR MODELO LOCAL ==========
                console.log('💾 Eliminando modelo local...');

                // 1. Eliminar de tfjsTrainer (memoria + localStorage info)
                await tfjsTrainer.deleteModel(selectedCategory, modelName);
                console.log('✅ Modelo eliminado de tfjsTrainer');

                // 2. Eliminar de IndexedDB
                try {
                    const modelKey = `${selectedCategory}_${modelName}`;
                    const indexedDBKey = `indexeddb://${modelKey}`;

                    // Intentar cargar y luego eliminar para limpiar IndexedDB
                    try {
                        await tf.io.removeModel(indexedDBKey);
                        console.log('✅ Modelo eliminado de IndexedDB');
                    } catch (e) {
                        console.log('ℹ️ Modelo no encontrado en IndexedDB:', e.message);
                    }
                } catch (error) {
                    console.warn('⚠️ Error eliminando de IndexedDB:', error);
                }

                // 3. Limpiar de modelDownloadService si existe ahí también
                try {
                    await modelDownloadService.deleteModel(selectedCategory, modelName);
                    console.log('✅ Modelo eliminado de modelDownloadService');
                } catch (e) {
                    console.log('ℹ️ Modelo no estaba en modelDownloadService');
                }

            } else if (source === 'backend') {
                // ========== ELIMINAR MODELO DEL BACKEND ==========
                const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://backend-c2aj.onrender.com';
                const deleteUrl = `${API_BASE_URL}/train/${selectedCategory}/models/${modelName}`;

                console.log(`📡 Intentando eliminar del backend: ${deleteUrl}`);

                try {
                    const response = await fetch(deleteUrl, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    });

                    if (response.ok) {
                        const responseData = await response.json();
                        console.log('✅ Modelo eliminado del backend:', responseData);
                    } else if (response.status === 404) {
                        console.warn('⚠️ Modelo no encontrado en el backend (404)');
                    } else {
                        const errorData = await response.json().catch(() => ({}));
                        console.warn(`⚠️ Error del backend: ${response.status}`, errorData);
                    }
                } catch (fetchError) {
                    console.warn('⚠️ Error en petición al backend:', fetchError);
                }

                // Siempre limpiar del almacenamiento local, independientemente del resultado del backend
                console.log('🧹 Limpiando almacenamiento local...');

                // 1. Eliminar de modelDownloadService (localStorage + cache)
                try {
                    await modelDownloadService.deleteModel(selectedCategory, modelName);
                    console.log('✅ Modelo eliminado de modelDownloadService');
                } catch (e) {
                    console.warn('⚠️ Error eliminando de modelDownloadService:', e);
                }

                // 2. Eliminar de IndexedDB
                try {
                    const modelKey = `${selectedCategory}_${modelName}`;
                    const indexedDBKey = `indexeddb://${modelKey}`;

                    await tf.io.removeModel(indexedDBKey);
                    console.log('✅ Modelo eliminado de IndexedDB');
                } catch (e) {
                    console.log('ℹ️ Modelo no encontrado en IndexedDB');
                }

                // 3. Eliminar de tfjsTrainer si existe
                try {
                    await tfjsTrainer.deleteModel(selectedCategory, modelName);
                    console.log('✅ Modelo eliminado de tfjsTrainer');
                } catch (e) {
                    console.log('ℹ️ Modelo no estaba en tfjsTrainer');
                }

                // 4. Limpiar localStorage directamente
                try {
                    const modelKey = `${selectedCategory}_${modelName}`;
                    localStorage.removeItem(`${modelKey}_info`);
                    console.log('✅ Info del modelo eliminada de localStorage');
                } catch (e) {
                    console.warn('⚠️ Error limpiando localStorage:', e);
                }
            }

            // Recargar lista de modelos
            console.log('🔄 Recargando lista de modelos...');
            await loadAvailableModels(selectedCategory);

            alert(`✅ Modelo "${modelName}" eliminado exitosamente`);

        } catch (error) {
            console.error('❌ Error eliminando modelo:', error);
            alert(`❌ Error al eliminar modelo:\n\n${error.message}`);

            // Recargar modelos de todas formas
            await loadAvailableModels(selectedCategory);
        }
    };

    const checkAndDownloadModels = async (category = null) => {
        try {
            const targetCategory = category || selectedCategory;

            setDownloadStatus(prev => ({
                ...prev,
                checking: true,
                message: 'Verificando modelos disponibles...'
            }));

            const result = await modelDownloadService.checkAndDownloadModels(targetCategory);

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
                        : '✅ Todos los modelos están actualizados'
            }));

            // Recargar lista de modelos
            await loadAvailableModels(targetCategory);

            return result;

        } catch (error) {
            console.error('❌ Error en verificación automática:', error);
            setDownloadStatus(prev => ({
                ...prev,
                checking: false,
                downloading: false,
                message: `❌ Error: ${error.message}`,
                errors: [{ error: error.message }]
            }));
        }
    };

    // ========== FUNCIONES PARA SUBIR MODELO AL BACKEND ==========

    const uploadModelToBackend = async (model, category, modelName, labels) => {
        try {
            console.log("🚀 Subiendo modelo...");

            const sanitizedModelName = modelName
                .replace(/\s+/g, '_')
                .replace(/[^a-zA-Z0-9_-]/g, '')
                .toLowerCase();

            console.log(`📝 Nombre original: "${modelName}" -> Sanitizado: "${sanitizedModelName}"`);

            const modelArtifacts = await model.save(tf.io.withSaveHandler(async (artifacts) => {
                const weightsFileName = `weights.bin`;

                const modelJsonCorrect = {
                    modelTopology: artifacts.modelTopology,
                    weightsManifest: [
                        {
                            paths: [weightsFileName],
                            weights: artifacts.weightSpecs
                        }
                    ],
                    format: "layers-model",
                    generatedBy: "TensorFlow.js tfjs-layers v4.0.0",
                    convertedBy: "HandSignAI Frontend Training System v1.0",
                };

                const formData = new FormData();

                const modelJsonBlob = new Blob(
                    [JSON.stringify(modelJsonCorrect, null, 2)],
                    { type: 'application/json' }
                );
                formData.append('model_json', modelJsonBlob, `${sanitizedModelName}_model.json`);

                const weightsBlob = new Blob([artifacts.weightData], {
                    type: 'application/octet-stream'
                });
                formData.append('weights_bin', weightsBlob, weightsFileName);

                formData.append('category', category);
                formData.append('model_name', sanitizedModelName);
                formData.append('upload_timestamp', new Date().toISOString());
                formData.append('labels', JSON.stringify(labels));

                const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://backend-c2aj.onrender.com';
                const uploadUrl = `${API_BASE_URL}/train/upload-tfjs-model`;

                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error("❌ Error del servidor:", response.status, errorText);
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const result = await response.json();
                console.log("✅ Respuesta del servidor:", result);

                return result;
            }));

            console.log("🎉 UPLOAD COMPLETO - Modelo subido exitosamente!");

            return {
                success: true,
                message: `Modelo ${sanitizedModelName} subido correctamente`,
                sanitizedName: sanitizedModelName,
                originalName: modelName,
                artifacts: modelArtifacts
            };

        } catch (error) {
            console.error("❌ Error en upload:", error);
            return {
                success: false,
                message: `Error: ${error.message}`,
                error: error
            };
        }
    };

    // ========== FUNCIONES DE ENTRENAMIENTO ==========

    const handleLocalTraining = async () => {
        try {
            setTrainingProgress({ status: 'training', progress: 0, message: 'Validando datos...' });

            const backendStatus = await apiService.getDatasetStatus(selectedCategory);
            console.log('📊 Estado del dataset en backend:', backendStatus);

            setTrainingProgress({ status: 'training', progress: 10, message: 'Descargando datos del backend...' });

            const backendData = await apiService.downloadTrainingData(selectedCategory);

            console.log('📥 Datos descargados del backend:', {
                categoria: backendData.category,
                muestras: backendData.statistics.total_samples,
                etiquetas: backendData.statistics.total_labels,
                labels: backendData.labels,
                shapeX: backendData.statistics.features_per_sample
            });

            if (!backendData.X || backendData.X.length === 0) {
                throw new Error(`No hay muestras disponibles en el backend para la categoría '${selectedCategory}'`);
            }

            const X = backendData.X;
            const y = backendData.y;
            const labels = backendData.labels;

            setTrainingProgress({ status: 'training', progress: 20, message: 'Iniciando entrenamiento local...' });

            console.log('🧠 Iniciando entrenamiento local con TensorFlow.js...');
            const result = await tfjsTrainer.trainModel(
                X, y, labels, epochs, 16,
                (progress, message) => {
                    console.log(`📈 Progreso: ${progress}% - ${message}`);
                    setTrainingProgress({ status: 'training', progress: Math.min(85, progress), message });
                }
            );

            console.log('🎯 Resultado del entrenamiento:', result);

            if (!result || !result.model) {
                throw new Error('El entrenamiento no devolvió un modelo válido');
            }

            if (!result.labels || result.labels.length === 0) {
                console.warn('⚠️ No se devolvieron etiquetas, usando las originales');
                result.labels = labels;
            }

            setTrainingProgress({ status: 'training', progress: 90, message: 'Guardando modelo local...' });

            console.log('💾 Guardando modelo local...');
            const modelInfo = await tfjsTrainer.saveModel(
                selectedCategory,
                modelName,
                result.model,
                result.labels
            );

            console.log('✅ Modelo guardado localmente:', modelInfo);

            setTrainingProgress({ status: 'training', progress: 95, message: 'Subiendo modelo al backend...' });

            try {
                await uploadModelToBackend(result.model, selectedCategory, modelName, result.labels);
                console.log('🎉 ¡Modelo subido exitosamente al backend!');
            } catch (uploadError) {
                console.warn('⚠️ Modelo no se pudo subir al backend, pero está guardado localmente:', uploadError);
            }

            setTrainingProgress({
                status: 'completed',
                progress: 100,
                message: '✅ Modelo entrenado localmente y subido al backend',
                metrics: {
                    accuracy: (result.finalAccuracy * 100).toFixed(1) + '%',
                    loss: result.finalLoss.toFixed(4)
                }
            });

            await checkAndDownloadModels(selectedCategory);
            await loadAvailableModels();

            console.log('🎉 ¡Entrenamiento local completado exitosamente!');

        } catch (error) {
            console.error('❌ Error detallado en entrenamiento local:', error);

            setTrainingProgress({
                status: 'error',
                progress: 0,
                message: `❌ Error: ${error.message}`
            });

            setTimeout(() => {
                alert(`Error en entrenamiento:\n${error.message}\n\nRevisa la consola para más detalles.`);
            }, 500);
        }
    };

    const handleStartTraining = async () => {
        await handleLocalTraining();
    };

    const loadBackendDatasetStatus = async (category) => {
        try {
            const status = await apiService.getDatasetStatus(category);
            setDatasetStatus(status);
            return status;
        } catch (error) {
            console.error('Error cargando estado del backend:', error);
            const emptyStatus = { labels: {}, summary: { total_samples: 0 } };
            setDatasetStatus(emptyStatus);
            return emptyStatus;
        }
    };

    const handleCategoryChange = async (newCategory) => {
        console.log(`🔄 Cambiando de "${selectedCategory}" a "${newCategory}"`);

        // Actualizar la categoría
        setSelectedCategory(newCategory);

        // Limpiar lista mientras carga
        setAvailableModels([]);

        // Cargar datos de la nueva categoría
        try {
            await Promise.all([
                loadBackendDatasetStatus(newCategory),
                loadAvailableModels(newCategory)
            ]);
            console.log(`✅ Categoría "${newCategory}" cargada exitosamente`);
        } catch (error) {
            console.error('❌ Error al cambiar categoría:', error);
        }
    };

    // ========== EFECTOS ==========

    useEffect(() => {

        const loadData = async () => {
            await loadBackendDatasetStatus(selectedCategory);
            await loadAvailableModels(selectedCategory);
        };

        loadData();
    }, [selectedCategory]);

    // ========== RENDER ==========

    return (
        <div className="training-content">
            {/* Panel izquierdo - Controles */}
            <div className="control-panel">
                <div className="train-panel">
                    <h4 className="train-panel-header">Configuración de Entrenamiento:</h4>

                    {/* Selector de Categoría */}
                    <div className="form-group">
                        <label className="form-label">Categoría:</label>
                        <select
                            className="form-select"
                            value={selectedCategory}
                            onChange={(e) => handleCategoryChange(e.target.value)}
                        >
                            {Object.entries(categories).map(([key, category]) => (
                                <option key={key} value={key}>{category.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Nombre del Modelo:</label>
                        <input
                            type="text"
                            className="form-input"
                            value={modelName}
                            onChange={(e) => setModelName(e.target.value)}
                            placeholder="modelo_local"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Número de Épocas:</label>
                        <input
                            type="number"
                            className="form-input"
                            value={epochs}
                            onChange={(e) => setEpochs(parseInt(e.target.value))}
                            min="1"
                            max="200"
                        />
                    </div>

                    <button
                        className="btn-primary"
                        onClick={handleStartTraining}
                        disabled={trainingProgress?.status === 'training'}
                    >
                        {trainingProgress?.status === 'training' ? '🔄 Entrenando...' : '🚀 Iniciar Entrenamiento'}
                    </button>

                    {/* Progreso del Entrenamiento */}
                    {trainingProgress && (
                        <div className={`training-progress-container ${trainingProgress.status}`}>
                            <div className="training-progress-header">
                                {trainingProgress.status === 'training' ? '🔄 Entrenando...' :
                                    trainingProgress.status === 'completed' ? '✅ Entrenamiento Completado' :
                                        '❌ Error en Entrenamiento'}
                            </div>

                            {trainingProgress.status === 'training' && (
                                <div className="progress-bar-wrapper">
                                    <div className="progress-bar">
                                        <div 
                                            className="progress-bar-fill"
                                            style={{ width: `${trainingProgress.progress}%` }}
                                        ></div>
                                    </div>
                                    <div className="progress-bar-text">
                                        {trainingProgress.progress}% - {trainingProgress.message}
                                    </div>
                                </div>
                            )}

                            {trainingProgress.status === 'completed' && trainingProgress.metrics && (
                                <div className="training-metrics">
                                    <div><strong>Precisión:</strong> {trainingProgress.metrics.accuracy}</div>
                                    <div><strong>Pérdida:</strong> {trainingProgress.metrics.loss}</div>
                                </div>
                            )}

                            {trainingProgress.status === 'error' && (
                                <div className="training-error">{trainingProgress.message}</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Panel derecho - Información y Modelos */}
            <div className="info-panel">
                <div className="info-card">
                    <h4 className="info-card-title">📊 Estado del Dataset</h4>
                    <div className="dataset-summary">
                        <div className="summary-item">
                            <strong>Categoría:</strong> {categories[selectedCategory]?.name}
                        </div>
                        <div className="summary-item">
                            <strong>Total muestras:</strong> {datasetStatus.summary?.total_samples || 0}
                        </div>
                        <div className="summary-item">
                            <strong>Etiquetas:</strong> {categories[selectedCategory]?.labels.length || 0}
                        </div>
                    </div>
                </div>

                {/* Lista de Modelos */}
                <div className="info-card">
                    <div className="info-card-header">
                        <h4 className="info-card-title">🤖 Modelos Disponibles ({availableModels.length})</h4>
                        <button className="btn-reload" onClick={() => loadAvailableModels()}>
                            🔄 Recargar
                        </button>
                    </div>

                    <div className="models-list">
                        {availableModels.length === 0 ? (
                            <div className="models-empty">
                                No hay modelos para esta categoría
                            </div>
                        ) : (
                            availableModels.map((model, index) => (
                                <div key={`${model.category}_${model.model_name}_${index}`} className="model-item">
                                    <div className="model-item-header">
                                        <div className="model-item-info">
                                            <div className="model-name">{model.model_name}</div>
                                            <div className="model-source">
                                                {model.source === 'backend' ? '🔽 Backend' : '💾 Local'}
                                            </div>
                                        </div>
                                        <button
                                            className="btn-delete"
                                            onClick={() => handleDeleteModel(model.model_name, model.source)}
                                        >
                                            🗑️ Eliminar
                                        </button>
                                    </div>

                                    <div className="model-details">
                                        <div>Precisión: <strong>{model.accuracy || 0}%</strong></div>
                                        <div>Muestras: <strong>{model.samples_used || 0}</strong></div>
                                        {model.training_date && (
                                            <div>Fecha: {new Date(model.training_date).toLocaleDateString()}</div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="info-card">
                    <h4 className="info-card-title">🔍 Sincronización con Backend</h4>
                    <div className="download-status">
                        <div className="status-message">
                            <strong>Estado:</strong> {downloadStatus.message || 'Listo'}
                        </div>
                        <button
                            className="btn-download"
                            onClick={() => checkAndDownloadModels(selectedCategory)}
                            disabled={downloadStatus.checking || downloadStatus.downloading}
                        >
                            {downloadStatus.checking ? '🔍 Verificando...' :
                                downloadStatus.downloading ? '⬇️ Descargando...' :
                                    '⬇️ Descargar Modelos del Backend'}
                        </button>
                    </div>

                    {(downloadStatus.downloadedModels.length > 0 || downloadStatus.errors.length > 0) && (
                        <div className="download-summary">
                            ✅ Descargados: {downloadStatus.downloadedModels.length} |
                            ❌ Errores: {downloadStatus.errors.length}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TrainPage;