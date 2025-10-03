// src/Components/TrainingPage/CollectPage.jsx - CON CLASSNAMES
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import apiService from '../../services/apiService';
import modelDownloadService from '../../services/modelDownloadService';
import { speakAction } from "../VoiceAssistant/VoiceActions";
import MediaPipeCamera from '../Camara/MediaPipeCamera';
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

const CollectPage = () => {
    const [selectedCategory, setSelectedCategory] = useState('vocales');
    const [selectedLabel, setSelectedLabel] = useState('');
    const [isCollecting, setIsCollecting] = useState(false);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [datasetStatus, setDatasetStatus] = useState({});
    const [bufferStatus, setBufferStatus] = useState({
        count: 0,
        totalCollected: 0,
        sending: false,
        lastSent: null
    });

    const collectingRef = useRef(false);
    const selectedLabelRef = useRef('');
    const lastCollectionTime = useRef(0);
    const processingRef = useRef(false);
    const sampleBufferRef = useRef([]);
    const BUFFER_SIZE = 10;
    const bufferStatusRef = useRef({
        count: 0,
        totalCollected: 0,
        sending: false
    });

    const COLLECTION_INTERVAL = 1000;
    const MIN_HAND_SIZE = 0.17;

    const loadBackendDatasetStatus = useCallback(async () => {
        try {
            const status = await apiService.getDatasetStatus(selectedCategory);
            setDatasetStatus(status);
        } catch (error) {
            console.error('Error cargando estado del backend:', error);
            setDatasetStatus({ labels: {}, summary: { total_samples: 0 } });
        }
    }, [selectedCategory]);

    const sendBufferToBackend = useCallback(async () => {
        if (sampleBufferRef.current.length === 0 || bufferStatusRef.current.sending) {
            return;
        }

        setBufferStatus(prev => ({ ...prev, sending: true }));
        bufferStatusRef.current.sending = true;

        try {
            const samplesToSend = [...sampleBufferRef.current];
            sampleBufferRef.current = [];
            setBufferStatus(prev => ({
                ...prev,
                count: 0,
                sending: true
            }));
            bufferStatusRef.current.count = 0;

            const batchResult = await apiService.collectBatchSamples(selectedCategory, samplesToSend);

            setBufferStatus(prev => ({
                ...prev,
                sending: false,
                lastSent: new Date().toISOString()
            }));

            bufferStatusRef.current.sending = false;
            await loadBackendDatasetStatus();

        } catch (error) {
            console.error('❌ Error enviando lote al backend:', error);
            console.log('🔄 Reintentando envío en 2 segundos...');
            
            // Agregar voz de error
            speakAction('capture', 'error');
            
            setTimeout(() => {
                setBufferStatus(prev => ({ ...prev, sending: false }));
                bufferStatusRef.current.sending = false;
            }, 2000);
        }
    }, [selectedCategory, loadBackendDatasetStatus]);

    const addToBuffer = useCallback((landmarks, label) => {
        if (bufferStatusRef.current.sending) {
            return;
        }

        const currentSamples = getLabelSamples(label);

        if (currentSamples >= 30) {
            setIsCollecting(false);
            collectingRef.current = false;
            console.log(`🛑 Límite alcanzado para ${label}. Recolección detenida automáticamente.`);
            return;
        }

        const sample = {
            landmarks,
            label,
            timestamp: new Date().toISOString(),
            id: Date.now() + Math.random()
        };

        sampleBufferRef.current.push(sample);

        const newCount = sampleBufferRef.current.length;
        const newTotal = bufferStatusRef.current.totalCollected + 1;

        setBufferStatus(prev => ({
            ...prev,
            count: newCount,
            totalCollected: newTotal
        }));

        bufferStatusRef.current.count = newCount;
        bufferStatusRef.current.totalCollected = newTotal;

        if (currentSamples + 1 >= 30) {
            setIsCollecting(false);
            collectingRef.current = false;
            console.log(`🎯 Límite de 30 muestras alcanzado para ${label}. Recolección completada.`);
            
            // Agregar voz cuando se completa la recolección
            speakAction('capture', 'complete');
        }

        if (newCount >= BUFFER_SIZE) {
            sendBufferToBackend();
        }
    }, [sendBufferToBackend]);

    const flushBuffer = useCallback(async () => {
        if (sampleBufferRef.current.length > 0 && !bufferStatusRef.current.sending) {
            await sendBufferToBackend();
        }
    }, [sendBufferToBackend]);

    const clearBuffer = useCallback(() => {
        sampleBufferRef.current = [];
        setBufferStatus({
            count: 0,
            totalCollected: 0,
            sending: false,
            lastSent: null
        });
        bufferStatusRef.current = {
            count: 0,
            totalCollected: 0,
            sending: false
        };
    }, []);

    const extractLandmarksArray = (multiHandLandmarks) => {
        if (!multiHandLandmarks || multiHandLandmarks.length === 0) return null;

        const landmarks = [];

        for (let i = 0; i < Math.min(2, multiHandLandmarks.length); i++) {
            for (const landmark of multiHandLandmarks[i]) {
                landmarks.push(landmark.x, landmark.y, landmark.z);
            }
        }

        if (multiHandLandmarks.length === 1) {
            for (let i = 0; i < 63; i++) {
                landmarks.push(0.0);
            }
        }

        return landmarks.length === 126 ? landmarks : null;
    };

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

    const handleHandDetected = useCallback((landmarksArray, rawLandmarks) => {
        if (!landmarksArray) return;

        const now = Date.now();

        if (collectingRef.current && selectedLabelRef.current) {
            const currentSamples = getLabelSamples(selectedLabelRef.current);

            if (currentSamples >= 30) {
                setIsCollecting(false);
                collectingRef.current = false;
                console.log(`🛑 Recolección automáticamente detenida para ${selectedLabelRef.current} (límite alcanzado)`);
                return;
            }

            if (bufferStatusRef.current.sending) {
                return;
            }

            const timeSinceLastCollection = now - lastCollectionTime.current;

            if (timeSinceLastCollection > COLLECTION_INTERVAL && !processingRef.current) {
                processingRef.current = true;
                addToBuffer(landmarksArray, selectedLabelRef.current);
                lastCollectionTime.current = now;
                processingRef.current = false;
            }
        }
    }, [addToBuffer]);

    const handleClearData = async (type = 'current') => {
        if (type === 'current' && !selectedLabel) {
            alert('Selecciona una etiqueta primero');
            return;
        }

        const wasCollecting = isCollecting;
        if (wasCollecting) {
            setIsCollecting(false);
            collectingRef.current = false;
            await flushBuffer();
        }

        let confirmMessage = '';

        if (type === 'current') {
            const currentSamples = getLabelSamples(selectedLabel);
            confirmMessage = `¿Eliminar todas las muestras de "${selectedLabel}" del backend?\n\nSe eliminarán ${currentSamples} muestras.\n\nEsta acción NO se puede deshacer.`;
        } else if (type === 'all') {
            const totalSamples = datasetStatus.summary?.total_samples || 0;
            confirmMessage = `¿Eliminar TODAS las muestras de "${selectedCategory}" del backend?\n\nSe eliminarán ${totalSamples} muestras.\n\nEsta acción NO se puede deshacer.`;
        }

        const userConfirmed = window.confirm(`CONFIRMACIÓN\n\n${confirmMessage}`);
        if (!userConfirmed) {
            if (wasCollecting) {
                setIsCollecting(true);
                collectingRef.current = true;
            }
            return;
        }

        try {
            if (type === 'current') {
                await apiService.clearLabelData(selectedCategory, selectedLabel);
                alert(`Datos de "${selectedLabel}" eliminados del backend`);
                
                // Agregar voz al eliminar datos
                speakAction('system', 'loading', `Datos de ${selectedLabel} eliminados`);
            } else if (type === 'all') {
                await apiService.clearCategoryData(selectedCategory);
                alert(`Todas las muestras de "${selectedCategory}" eliminadas del backend`);
                
                // Agregar voz al eliminar todos los datos
                speakAction('system', 'loading', `Todos los datos de ${selectedCategory} eliminados`);
            }

            await loadBackendDatasetStatus();

        } catch (error) {
            alert(`Error eliminando datos del backend: ${error.message}`);
            console.error('Error eliminando:', error);
            
            // Agregar voz de error
            speakAction('system', 'error');

            if (wasCollecting) {
                setIsCollecting(true);
                collectingRef.current = true;
            }
        }
    };

    const getLabelSamples = (label) => {
        return datasetStatus.labels?.[label]?.samples || 0;
    };

    const isLabelReady = (label) => {
        return getLabelSamples(label) >= 30;
    };

    const getCurrentLabels = () => {
        return categories[selectedCategory]?.labels || [];
    };

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
            
            // Agregar voz al iniciar cámara
            speakAction('capture', 'start');
        } catch (error) {
            console.error('Error solicitando permisos:', error);
            
            // Agregar voz de error de cámara
            speakAction('system', 'cameraError');
            
            alert(`No se pudo acceder a la cámara:\n${error.message}\n\nVerifica los permisos en tu navegador.`);
        }
    };

    const handleStopCamera = async () => {
        setIsCameraActive(false);
        setIsCollecting(false);
        collectingRef.current = false;
        processingRef.current = false;
        await flushBuffer();
    };

    const handleToggleCollection = () => {
        if (!selectedLabel) {
            alert('Selecciona una etiqueta primero');
            return;
        }

        const currentSamples = getLabelSamples(selectedLabel);

        if (currentSamples >= 30) {
            setIsCollecting(false);
            collectingRef.current = false;
            alert(`✅ ${selectedLabel} ya tiene 30 muestras. Recolección completada.`);
            return;
        }

        const newCollecting = !isCollecting;

        setIsCollecting(newCollecting);
        collectingRef.current = newCollecting;

        if (newCollecting) {
            lastCollectionTime.current = 0;
            processingRef.current = false;
            console.log(`▶️ Iniciando recolección para: ${selectedLabel} (${currentSamples}/30)`);
            
            // Agregar voz al iniciar recolección
            speakAction('capture', 'start', `Iniciando captura de gestos para ${selectedLabel}`);
        } else {
            flushBuffer();
            
            // Agregar voz al pausar recolección
            speakAction('system', 'loading', "Recolección pausada");
        }
    };

    const handleCategoryChange = async (newCategory) => {
        console.log(`Cambiando categoría a: ${newCategory}`);
        if (isCollecting) {
            setIsCollecting(false);
            collectingRef.current = false;
            await flushBuffer();
        }
        setSelectedCategory(newCategory);
        setSelectedLabel('');
        clearBuffer();
        
        // Agregar voz al cambiar categoría
        speakAction('navigation', 'capturar');
        
        await loadBackendDatasetStatus();
    };

    const handleLabelChange = async (label) => {
        if (isCollecting) {
            setIsCollecting(false);
            collectingRef.current = false;
            await flushBuffer();
        }

        setSelectedLabel(label);
        selectedLabelRef.current = label;
        clearBuffer();
        
        // Agregar voz al seleccionar etiqueta
        speakAction('capture', 'start', `Preparado para capturar gestos de ${label}`);
    };

    useEffect(() => {
        collectingRef.current = isCollecting;

        if (isCollecting && selectedLabel) {
            const currentSamples = getLabelSamples(selectedLabel);
            if (currentSamples >= 30) {
                setIsCollecting(false);
                collectingRef.current = false;
                console.log(`🛑 Recolección detenida automáticamente para ${selectedLabel} (límite alcanzado)`);
                
                // Agregar voz cuando se alcanza el límite automáticamente
                speakAction('capture', 'complete');
            }
        }
    }, [isCollecting, selectedLabel]);

    useEffect(() => {
        selectedLabelRef.current = selectedLabel;

        if (isCollecting && selectedLabel && getLabelSamples(selectedLabel) >= 30) {
            setIsCollecting(false);
            collectingRef.current = false;
        }
    }, [selectedLabel, isCollecting]);

    useEffect(() => {
        bufferStatusRef.current = bufferStatus;
    }, [bufferStatus]);

    useEffect(() => {
        loadBackendDatasetStatus();
    }, [selectedCategory, loadBackendDatasetStatus]);

    useEffect(() => {
        clearBuffer();
    }, [selectedCategory, selectedLabel, clearBuffer]);

    return (
        <div className="collect-main-wrapper" style={{ overflow: 'hidden' }}>
            <div className="collect-two-column-grid">
                {/* Panel izquierdo - Selectores y Controles de Recolección */}
                <div className="collect-left-panel">
                    {/* Selector de Categoría */}
                    <div style={{ marginBottom: '30px' }}>
                        <h2 className="collect-section-heading">Seleccionar Categoría:</h2>
                        <div className="collect-category-buttons-wrapper">
                            {Object.entries(categories).map(([key, category]) => (
                                <button
                                    key={key}
                                    onClick={() => handleCategoryChange(key)}
                                    className={`collect-category-btn ${selectedCategory === key ? 'collect-category-btn-selected' : 'collect-category-btn-unselected'}`}
                                >
                                    {selectedCategory === key && <span className="collect-category-status-dot">🔴</span>}
                                    {category.name}
                                </button>
                            ))}
                        </div>
                        <p className="collect-category-info-text">
                            Categoría actual: <strong>{categories[selectedCategory]?.name}</strong> ({getCurrentLabels().length} etiquetas)
                        </p>
                    </div>

                    {/* Sección de Recolección */}
                    <div>
                        <h2 className="collect-section-heading">
                            📊 Recolección de Datos - {categories[selectedCategory]?.name}
                        </h2>

                        <h3 className="collect-subsection-heading">Seleccionar Etiqueta:</h3>
                        <div className="collect-labels-buttons-wrapper">
                            {getCurrentLabels().map(label => {
                                const samples = getLabelSamples(label);
                                const isReady = samples >= 30;
                                return (
                                    <button
                                        key={label}
                                        onClick={() => handleLabelChange(label)}
                                        className={`collect-label-btn ${
                                            selectedLabel === label ? 'collect-label-btn-selected' :
                                            isReady ? 'collect-label-btn-ready' : 'collect-label-btn-default'
                                        }`}
                                    >
                                        <span className="collect-label-text-display">{label}</span>
                                        <span className="collect-label-count-badge">
                                            ({samples}/30)
                                        </span>
                                        {isReady && (
                                            <span className="collect-label-check-icon">
                                                ✓
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Controles de Recolección - MOVIDOS AQUÍ */}
                    <div className="collect-controls-box" style={{ marginTop: '20px' }}>
                        <h3 className="collect-controls-title">Controles de Recolección:</h3>

                        <div className="collect-action-buttons-row">
                            <button
                                onClick={handleToggleCollection}
                                disabled={!isCameraActive || !selectedLabel || isLabelReady(selectedLabel)}
                                className={`collect-action-btn ${
                                    !isCameraActive || !selectedLabel || isLabelReady(selectedLabel) ? '' :
                                    isCollecting ? 'collect-action-btn-toggle' : 'collect-action-btn-toggle-start'
                                }`}
                            >
                                {isLabelReady(selectedLabel) ? '✅ Completado (30/30)' :
                                    isCollecting ? '⏸️ Pausar Recolección' :
                                        `▶️ Iniciar Recolección (${getLabelSamples(selectedLabel)}/30)`
                                }
                            </button>

                            <button
                                onClick={() => handleClearData('current')}
                                disabled={!selectedLabel || getLabelSamples(selectedLabel) === 0}
                                className={`collect-action-btn ${(!selectedLabel || getLabelSamples(selectedLabel) === 0) ? '' : 'collect-action-btn-clear-label'}`}
                            >
                                🗑️ Borrar Etiqueta
                            </button>

                            <button
                                onClick={() => handleClearData('all')}
                                disabled={!datasetStatus.summary?.total_samples || datasetStatus.summary.total_samples === 0}
                                className={`collect-action-btn ${(!datasetStatus.summary?.total_samples || datasetStatus.summary.total_samples === 0) ? '' : 'collect-action-btn-clear-all'}`}
                            >
                                🗑️ Borrar Todo
                            </button>
                        </div>
                    </div>
                </div>

                {/* Panel derecho - Cámara y Botones de Cámara */}
                <div className="collect-right-column">
                    {/* Cámara */}
                    <div className="collect-camera-box">
                        <MediaPipeCamera
                            isActive={isCameraActive}
                            onHandDetected={handleHandDetected}
                            width={640}
                            height={480}
                        />

                        {/* Overlay de información */}
                        <div className="collect-camera-overlay-container">
                        </div>
                    </div>

                    {/* Botones de Cámara - MOVIDOS AQUÍ */}
                    <div className="collect-camera-buttons-row" style={{ marginTop: '20px' }}>
                        <button
                            onClick={handleStartCamera}
                            disabled={isCameraActive}
                            className={`collect-camera-control-btn ${!isCameraActive ? 'collect-camera-control-btn-start' : ''}`}
                        >
                            {isCameraActive ? '📹 Cámara Activa' : '🎥 Iniciar Cámara'}
                        </button>

                        <button
                            onClick={handleStopCamera}
                            disabled={!isCameraActive}
                            className={`collect-camera-control-btn ${isCameraActive ? 'collect-camera-control-btn-stop' : ''}`}
                        >
                            🛑 Detener Cámara
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CollectPage;