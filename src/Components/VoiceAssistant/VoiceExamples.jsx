import React from 'react';
import { speakAction, speakCustom } from './VoiceActions';
import './VoiceExamples.css';

function VoiceExamples() {
  const handlePracticeAction = (category) => {
    speakAction('practice', category);
  };

  const handleCaptureAction = (action) => {
    speakAction('capture', action);
  };

  const handleTrainingAction = (action) => {
    speakAction('training', action);
  };

  const handleFeedbackAction = (feedback) => {
    speakAction('feedback', feedback);
  };

  const handleCustomMessage = () => {
    speakCustom("Este es un mensaje personalizado. Puedes usar esta función para cualquier mensaje que necesites.");
  };

  return (
    <div className="voice-examples">
      <h3>Ejemplos de Acciones de Voz</h3>
      
      <div className="example-section">
        <h4>Práctica</h4>
        <div className="example-buttons">
          <button onClick={() => handlePracticeAction('vocales')}>
            Práctica Vocales
          </button>
          <button onClick={() => handlePracticeAction('numeros')}>
            Práctica Números
          </button>
          <button onClick={() => handlePracticeAction('abecedario')}>
            Práctica Abecedario
          </button>
        </div>
      </div>

      <div className="example-section">
        <h4>Captura</h4>
        <div className="example-buttons">
          <button onClick={() => handleCaptureAction('start')}>
            Iniciar Captura
          </button>
          <button onClick={() => handleCaptureAction('success')}>
            Captura Exitosa
          </button>
          <button onClick={() => handleCaptureAction('error')}>
            Error en Captura
          </button>
        </div>
      </div>

      <div className="example-section">
        <h4>Entrenamiento</h4>
        <div className="example-buttons">
          <button onClick={() => handleTrainingAction('start')}>
            Iniciar Entrenamiento
          </button>
          <button onClick={() => handleTrainingAction('complete')}>
            Entrenamiento Completo
          </button>
          <button onClick={() => handleTrainingAction('error')}>
            Error en Entrenamiento
          </button>
        </div>
      </div>

      <div className="example-section">
        <h4>Feedback</h4>
        <div className="example-buttons">
          <button onClick={() => handleFeedbackAction('correct')}>
            ¡Correcto!
          </button>
          <button onClick={() => handleFeedbackAction('incorrect')}>
            Inténtalo Nuevamente
          </button>
          <button onClick={() => handleFeedbackAction('excellent')}>
            ¡Excelente!
          </button>
        </div>
      </div>

      <div className="example-section">
        <h4>Mensaje Personalizado</h4>
        <button onClick={handleCustomMessage} className="custom-button">
          Mensaje Personalizado
        </button>
      </div>
    </div>
  );
}

export default VoiceExamples;
