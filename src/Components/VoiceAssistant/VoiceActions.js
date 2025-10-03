// Utilidades para manejar acciones de voz
export const VoiceActions = {
  // Mensajes para navegación
  navigation: {
    inicio: "Bienvenido a la página principal.",
    capturar: "Has seleccionado la sección de captura.",
    entrenar: "Has seleccionado la sección de entrenamiento.",
    practicar: "Has seleccionado la sección de práctica."
  },

  // Mensajes para acciones de práctica
  practice: {
    vocales: "Has seleccionado el entrenamiento de vocales.",
    numeros: "Has seleccionado el entrenamiento de números.",
    abecedario: "Has seleccionado el entrenamiento del abecedario.",
    palabras: "Has seleccionado el entrenamiento de palabras.",
    operaciones: "Has seleccionado el entrenamiento de operaciones aritméticas."
  },

  // Mensajes para acciones de captura
  capture: {
    start: "Iniciando captura de gestos. Posiciona tu mano frente a la cámara y realiza el gesto correspondiente.",
    success: "¡Excelente! Gestos capturados correctamente.",
    error: "Error en la captura. Por favor, intenta nuevamente.",
    complete: "Captura completada. Los gestos han sido guardados exitosamente."
  },

  // Mensajes para acciones de entrenamiento
  training: {
    start: "Iniciando entrenamiento del modelo de inteligencia artificial. Esto puede tomar unos minutos.",
    progress: "El modelo se está entrenando. Por favor espera.",
    complete: "¡Entrenamiento completado! El modelo está listo para reconocer gestos.",
    error: "Error durante el entrenamiento. Por favor, verifica que tengas suficientes datos."
  },

  // Mensajes para feedback general
  feedback: {
    correct: "¡Correcto! Has realizado el gesto perfectamente.",
    incorrect: "Inténtalo nuevamente. El gesto no coincide exactamente.",
    improvement: "¡Bien! Estás mejorando. Sigue practicando.",
    excellent: "¡Excelente trabajo! Dominas perfectamente este gesto."
  },

  // Mensajes para estados del sistema
  system: {
    loading: "Cargando, por favor espera.",
    ready: "Sistema listo. Puedes comenzar a practicar.",
    error: "Ha ocurrido un error. Por favor, recarga la página.",
    cameraError: "Error con la cámara. Verifica que esté conectada y permitas el acceso.",
    microphoneError: "Error con el micrófono. Verifica que esté conectado y permitas el acceso."
  }
};

// Función para activar voz con mensaje específico
export const speakAction = (category, action, customMessage = null) => {
    if (window.voiceAssistant && window.voiceAssistant.isEnabled()) {
        let message = customMessage;
        
        if (!message && VoiceActions[category] && VoiceActions[category][action]) {
            message = VoiceActions[category][action];
        }
        
        if (message) {
            // Detener cualquier síntesis de voz en curso
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            setTimeout(() => {
                window.voiceAssistant.speak(message);
            }, 100);
        }
    }
};

// Función para activar voz con mensaje personalizado
export const speakCustom = (message) => {
    if (window.voiceAssistant && window.voiceAssistant.isEnabled()) {
        // Detener cualquier síntesis de voz en curso
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        setTimeout(() => {
            window.voiceAssistant.speak(message);
        }, 100);
    }
};

export default VoiceActions;
