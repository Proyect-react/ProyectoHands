import { useEffect, useState } from 'react';
import './VoiceAssistant.css';

function VoiceAssistant() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Verificar si el navegador soporta síntesis de voz
  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      console.warn('Este navegador no soporta síntesis de voz');
    }
  }, []);

  // Función para hablar
  const speak = (text, priority = 'normal') => {
    if (!isEnabled || isSpeaking) return;

    // Detener cualquier síntesis en curso
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configurar la voz
    utterance.rate = 0.8; // Velocidad de habla
    utterance.pitch = 1.0; // Tono
    utterance.volume = 0.8; // Volumen
    utterance.lang = 'es-ES'; // Idioma español

    // Seleccionar voz en español si está disponible
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(voice => 
      voice.lang.includes('es') && voice.name.includes('Spanish')
    );
    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }

    setIsSpeaking(true);

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = (event) => {
      console.error('Error en síntesis de voz:', event.error);
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Función para detener el habla
  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Función para alternar el asistente de voz
  const toggleVoiceAssistant = () => {
    setIsEnabled(!isEnabled);
    if (isEnabled) {
      stopSpeaking();
    } else {
      speak('Asistente de voz activado. Estoy aquí para ayudarte con tu aprendizaje de lenguaje de señas.');
    }
  };

  // Exponer funciones globalmente para que otros componentes las usen
  useEffect(() => {
    window.voiceAssistant = {
      speak,
      stopSpeaking,
      isEnabled: () => isEnabled,
      isSpeaking: () => isSpeaking
    };
  }, [isEnabled, isSpeaking]);

  return (
    <div className="voice-assistant">
      <button 
        className={`voice-toggle-btn ${isEnabled ? 'active' : ''}`}
        onClick={toggleVoiceAssistant}
        title={isEnabled ? 'Desactivar asistente de voz' : 'Activar asistente de voz'}
      >
        <span className="voice-icon">
          {isSpeaking ? '🔊' : isEnabled ? '🎤' : '🔇'}
        </span>
        <span className="voice-status">
          {isSpeaking ? 'Hablando...' : isEnabled ? 'Voz Activada' : 'Voz Desactivada'}
        </span>
      </button>
      
      {isEnabled && (
        <div className="voice-controls">
          {isSpeaking && (
            <button 
              className="stop-voice-btn"
              onClick={stopSpeaking}
              title="Detener habla"
            >
              ⏹️
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default VoiceAssistant;
