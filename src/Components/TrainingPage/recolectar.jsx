// src/Components/TrainingPage/CollectPage.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import apiService from '../../services/apiService';
import modelDownloadService from '../../services/modelDownloadService';
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

    // ========== FUNCIONES DEL BACKEND ==========

    const loadBackendDatasetStatus = useCallback(async () => {
        try {
            const status = await apiService.getDatasetStatus(selectedCategory);
            setDatasetStatus(status);
        } catch (error) {
            console.error('Error cargando estado del backend:', error);
            setDatasetStatus({ labels: {}, summary: { total_samples: 0 } });
        }
    }, [selectedCategory]);

    // ========== FUNCIONES DE BUFFER ==========

    const sendBufferToBackend = useCallback(async () => {
        if (sampleBufferRef.current.length === 0 || bufferStatusRef.current.sending) {
            return;
        }


        setBufferStatus(prev => ({ ...prev, sending: true }));
        bufferStatusRef.current.sending = true;

        try {
            const samplesToSend = [...sampleBufferRef.current];

            // 🔥 LIMPIAR EL BUFFER INMEDIATAMENTE para evitar que se sigan agregando muestras
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

            // 🔥 REINTENTAR EN CASO DE ERROR (opcional)
            console.log('🔄 Reintentando envío en 2 segundos...');
            setTimeout(() => {
                setBufferStatus(prev => ({ ...prev, sending: false }));
                bufferStatusRef.current.sending = false;
            }, 2000);
        }
    }, [selectedCategory, loadBackendDatasetStatus]);

    const addToBuffer = useCallback((landmarks, label) => {
        // 🔥 BLOQUEAR SI EL BUFFER ESTÁ ENVIANDO
        if (bufferStatusRef.current.sending) {
            return;
        }

        const currentSamples = getLabelSamples(label);

        // 🔥 DETENER AUTOMÁTICAMENTE si ya se alcanzó el límite
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


        // 🔥 VERIFICAR SI SE ALCANZÓ EL LÍMITE después de agregar esta muestra
        if (currentSamples + 1 >= 30) {
            setIsCollecting(false);
            collectingRef.current = false;
            console.log(`🎯 Límite de 30 muestras alcanzado para ${label}. Recolección completada.`);
        }

        // 🔥 ENVIAR INMEDIATAMENTE SI SE ALCANZA EL TAMAÑO DEL BUFFER
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

    // ========== FUNCIONES AUXILIARES ==========

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

    // ========== HANDLER PARA MEDIAPIPECAMERA ==========

    const handleHandDetected = useCallback((landmarksArray, rawLandmarks) => {
        if (!landmarksArray) return;

        const now = Date.now();

        // 🔥 VERIFICAR SI DEBEMOS DETENER LA RECOLECCIÓN
        if (collectingRef.current && selectedLabelRef.current) {
            const currentSamples = getLabelSamples(selectedLabelRef.current);

            // Detener si ya se alcanzó el límite
            if (currentSamples >= 30) {
                setIsCollecting(false);
                collectingRef.current = false;
                console.log(`🛑 Recolección automáticamente detenida para ${selectedLabelRef.current} (límite alcanzado)`);
                return;
            }

            // 🔥 VERIFICAR SI EL BUFFER ESTÁ OCUPADO
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

    // ========== HANDLERS ==========

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
            } else if (type === 'all') {
                await apiService.clearCategoryData(selectedCategory);
                alert(`Todas las muestras de "${selectedCategory}" eliminadas del backend`);
            }

            await loadBackendDatasetStatus();

        } catch (error) {
            alert(`Error eliminando datos del backend: ${error.message}`);
            console.error('Error eliminando:', error);

            if (wasCollecting) {
                setIsCollecting(true);
                collectingRef.current = true;
            }
        }
    };

    // Funciones auxiliares
    const getLabelSamples = (label) => {
        return datasetStatus.labels?.[label]?.samples || 0;
    };

    const isLabelReady = (label) => {
        return getLabelSamples(label) >= 30;
    };

    const getCurrentLabels = () => {
        return categories[selectedCategory]?.labels || [];
    };

    // Handlers básicos
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

        // 🔥 DETENER SI YA SE ALCANZÓ EL LÍMITE
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
        } else {
            flushBuffer();
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
        await loadBackendDatasetStatus();
    };

    const handleLabelChange = async (label) => {
        // 🚨 PAUSAR LA RECOLECCIÓN AL CAMBIAR DE ETIQUETA
        if (isCollecting) {
            setIsCollecting(false);
            collectingRef.current = false;
            await flushBuffer();
        }

        setSelectedLabel(label);
        selectedLabelRef.current = label;
        clearBuffer();

    };

    // ========== EFECTOS ==========

    useEffect(() => {
        collectingRef.current = isCollecting;

        // 🔥 VERIFICAR SI DEBEMOS DETENER LA RECOLECCIÓN CUANDO CAMBIA EL ESTADO DEL DATASET
        if (isCollecting && selectedLabel) {
            const currentSamples = getLabelSamples(selectedLabel);
            if (currentSamples >= 30) {
                setIsCollecting(false);
                collectingRef.current = false;
                console.log(`🛑 Recolección detenida automáticamente para ${selectedLabel} (límite alcanzado)`);
            }
        }
    }, [isCollecting, selectedLabel]);

    useEffect(() => {
        selectedLabelRef.current = selectedLabel;

        // 🚨 DETENER RECOLECCIÓN SI LA NUEVA ETIQUETA YA ESTÁ COMPLETA
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

    // ========== RENDER ==========

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #BDD8E9 0%, #7BBDE8 100%)',
            padding: '20px',
            fontFamily: 'Inter, sans-serif'
        }}>
            {/* Layout principal con dos columnas */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '30px',
                maxWidth: '1400px',
                margin: '0 auto'
            }}>

                {/* Panel izquierdo - Selectores */}
                <div style={{
                    background: 'white',
                    borderRadius: '15px',
                    padding: '25px',
                    boxShadow: '0 10px 30px rgba(0, 29, 57, 0.1)',
                    border: '1px solid rgba(110, 162, 179, 0.2)',
                    height: 'fit-content'
                }}>
                    {/* Selector de Categoría */}
                    <div style={{ marginBottom: '30px' }}>
                        <h2 style={{ color: '#001D39', fontWeight: '600', marginBottom: '20px', fontSize: '18px' }}>Seleccionar Categoría:</h2>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {Object.entries(categories).map(([key, category]) => (
                                <button
                                    key={key}
                                    onClick={() => handleCategoryChange(key)}
                                    style={{
                                        background: selectedCategory === key ? '#4CAF50' : 'white',
                                        color: selectedCategory === key ? 'white' : '#333',
                                        border: selectedCategory === key ? 'none' : '2px solid #e0e0e0',
                                        padding: '10px 15px',
                                        borderRadius: '8px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        transition: 'all 0.3s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        minWidth: '100px',
                                        justifyContent: 'center'
                                    }}
                                >
                                    {selectedCategory === key && <span style={{ fontSize: '12px' }}>🔴</span>}
                                    {category.name}
                                </button>
                            ))}
                        </div>
                        <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#666' }}>
                            Categoría actual: <strong>{categories[selectedCategory]?.name}</strong> ({getCurrentLabels().length} etiquetas)
                        </p>
                    </div>

                    {/* Sección de Recolección */}
                    <div>
                        <h2 style={{ color: '#001D39', fontWeight: '600', marginBottom: '15px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            📊 Recolección de Datos - {categories[selectedCategory]?.name}
                        </h2>

                        <h3 style={{ color: '#001D39', fontWeight: '500', marginBottom: '15px', fontSize: '16px' }}>Seleccionar Etiqueta:</h3>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {getCurrentLabels().map(label => {
                                const samples = getLabelSamples(label);
                                const isReady = samples >= 30;
                                return (
                                    <button
                                        key={label}
                                        onClick={() => handleLabelChange(label)}
                                        style={{
                                            background: selectedLabel === label ? '#4CAF50' :
                                                isReady ? '#e8f5e8' : 'white',
                                            color: selectedLabel === label ? 'white' :
                                                isReady ? '#4CAF50' : '#333',
                                            border: selectedLabel === label ? 'none' :
                                                isReady ? '2px solid #4CAF50' : '2px solid #e0e0e0',
                                            padding: '15px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontSize: '18px',
                                            fontWeight: '600',
                                            transition: 'all 0.3s ease',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '5px',
                                            minWidth: '70px',
                                            position: 'relative'
                                        }}
                                    >
                                        <span style={{ fontSize: '20px' }}>{label}</span>
                                        <span style={{ fontSize: '10px', opacity: 0.8 }}>
                                            ({samples}/30)
                                        </span>
                                        {isReady && (
                                            <span style={{
                                                position: 'absolute',
                                                top: '-5px',
                                                right: '-5px',
                                                background: '#4CAF50',
                                                color: 'white',
                                                borderRadius: '50%',
                                                width: '18px',
                                                height: '18px',
                                                fontSize: '10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                ✓
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Panel derecho - Cámara y Controles */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px'
                }}>
                    {/* Botones de Cámara */}
                    <div style={{
                        display: 'flex',
                        gap: '15px',
                        justifyContent: 'center'
                    }}>
                        <button
                            onClick={handleStartCamera}
                            disabled={isCameraActive}
                            style={{
                                background: isCameraActive ? '#e0e0e0' : '#4CAF50',
                                color: 'white',
                                border: 'none',
                                padding: '12px 20px',
                                borderRadius: '8px',
                                cursor: isCameraActive ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                                fontSize: '14px',
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            {isCameraActive ? '📹 Cámara Activa' : '🎥 Iniciar Cámara'}
                        </button>

                        <button
                            onClick={handleStopCamera}
                            disabled={!isCameraActive}
                            style={{
                                background: !isCameraActive ? '#e0e0e0' : '#f44336',
                                color: 'white',
                                border: 'none',
                                padding: '12px 20px',
                                borderRadius: '8px',
                                cursor: !isCameraActive ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                                fontSize: '14px',
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            🛑 Detener Cámara
                        </button>
                    </div>

                    {/* Cámara */}
                    <div style={{
                        position: 'relative',
                        width: '100%',
                        background: '#000',
                        borderRadius: '15px',
                        overflow: 'hidden',
                        boxShadow: '0 10px 30px rgba(0, 29, 57, 0.2)',
                        border: '3px solid rgba(189, 216, 233, 0.3)'
                    }}>
                        <MediaPipeCamera
                            isActive={isCameraActive}
                            onHandDetected={handleHandDetected}
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
                            {isLabelReady(selectedLabel) ?
                                `✅ ${selectedLabel} completado (30/30 muestras)` :
                                isCollecting ?
                                    `🟢 Recolectando muestras para "${selectedLabel}" - ${getLabelSamples(selectedLabel)}/30 - Mantén tu mano estable` :
                                    '⏸️ Selecciona una etiqueta e inicia la recolección'
                            }
                        </div>
                    </div>

                    {/* Controles de Recolección */}
                    <div style={{
                        background: 'white',
                        borderRadius: '15px',
                        border: '1px solid rgba(110, 162, 179, 0.3)',
                        boxShadow: '0 10px 30px rgba(0, 29, 57, 0.1)',
                        padding: '20px',
                        textAlign: 'center'
                    }}>
                        <h3 style={{ color: '#001D39', fontWeight: '600', marginBottom: '15px', fontSize: '16px' }}>Controles de Recolección:</h3>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button
                                onClick={handleToggleCollection}
                                disabled={!isCameraActive || !selectedLabel || isLabelReady(selectedLabel)}
                                style={{
                                    background: !isCameraActive || !selectedLabel || isLabelReady(selectedLabel) ? '#e0e0e0' :
                                        isCollecting ? '#FF9800' : '#4CAF50',
                                    color: 'white',
                                    border: 'none',
                                    padding: '12px 20px',
                                    borderRadius: '8px',
                                    cursor: (!isCameraActive || !selectedLabel || isLabelReady(selectedLabel)) ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    transition: 'all 0.3s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    minWidth: '180px',
                                    justifyContent: 'center'
                                }}
                            >
                                {isLabelReady(selectedLabel) ? '✅ Completado (30/30)' :
                                    isCollecting ? '⏸️ Pausar Recolección' :
                                        `▶️ Iniciar Recolección (${getLabelSamples(selectedLabel)}/30)`
                                }
                            </button>

                            <button
                                onClick={() => handleClearData('current')}
                                disabled={!selectedLabel || getLabelSamples(selectedLabel) === 0}
                                style={{
                                    background: !selectedLabel || getLabelSamples(selectedLabel) === 0 ? '#e0e0e0' : '#FF9800',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 15px',
                                    borderRadius: '8px',
                                    cursor: (!selectedLabel || getLabelSamples(selectedLabel) === 0) ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '12px',
                                    transition: 'all 0.3s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                🗑️ Borrar Etiqueta
                            </button>

                            <button
                                onClick={() => handleClearData('all')}
                                disabled={!datasetStatus.summary?.total_samples || datasetStatus.summary.total_samples === 0}
                                style={{
                                    background: (!datasetStatus.summary?.total_samples || datasetStatus.summary.total_samples === 0) ? '#e0e0e0' : '#f44336',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 15px',
                                    borderRadius: '8px',
                                    cursor: (!datasetStatus.summary?.total_samples || datasetStatus.summary.total_samples === 0) ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '12px',
                                    transition: 'all 0.3s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                🗑️ Borrar Todo
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CollectPage;