import "./PracticeSection.css";
import { speakAction } from "../VoiceAssistant/VoiceActions";

function PracticeSection() {
  const practiceCategories = [
    {
      id: "vocales",
      title: "Vocales",
      description: "Aprende las 5 vocales en lenguaje de señas",
      elements: "5 elementos",
      icon: "🔤",
      iconBg: "#FF6B9D"
    },
    {
      id: "numeros",
      title: "Números",
      description: "Practica los números del 0 al 9",
      elements: "10 elementos",
      icon: "🔢",
      iconBg: "#4ECDC4"
    },
    {
      id: "abecedario",
      title: "Abecedario",
      description: "Domina todas las letras del alfabeto",
      elements: "27 elementos",
      icon: "📚",
      iconBg: "#45B7D1"
    },
    {
      id: "palabras-basicas",
      title: "Palabras Básicas",
      description: "Palabras esenciales para comunicarse",
      elements: "10 elementos",
      icon: "💬",
      iconBg: "#96CEB4"
    },
    {
      id: "operaciones",
      title: "Operaciones Aritméticas",
      description: "Símbolos matemáticos básicos",
      elements: "5 elementos",
      icon: "➕",
      iconBg: "#FECA57"
    }
  ];

  const handleStartPractice = (categoryId) => {
    console.log(`Iniciando práctica de: ${categoryId}`);
    // Activar voz para la categoría seleccionada
    speakAction('practice', categoryId);
  };

  return (
    <div className="practice-section">
      {/* Header */}
      <div className="practice-header">
        <h2 className="practice-title">Practicar Lenguaje de Señas</h2>
        <p className="practice-subtitle">
          Selecciona una categoría para comenzar a practicar con reconocimiento de IA
        </p>
      </div>

      {/* Practice Categories Grid */}
      <div className="practice-categories-grid">
        {practiceCategories.map((category) => (
          <div key={category.id} className="practice-category-card">
            <div 
              className="category-icon" 
              style={{ backgroundColor: category.iconBg }}
            >
              {category.icon}
            </div>
            <h3 className="category-title">{category.title}</h3>
            <p className="category-description">{category.description}</p>
            <div className="category-elements">{category.elements}</div>
            <button 
              className="start-practice-button"
              onClick={() => handleStartPractice(category.id)}
            >
              Comenzar Práctica
            </button>
          </div>
        ))}
      </div>

      {/* Information Section */}
      <div className="practice-info-section">
        <div className="info-column">
          <h3 className="info-title">¿Cómo funciona la práctica?</h3>
          <h4 className="info-subtitle">Reconocimiento con IA</h4>
          <ul className="info-list">
            <li>Usa tu cámara para capturar gestos en tiempo real</li>
            <li>El modelo de IA analiza tu gesto</li>
            <li>Recibe retroalimentación instantánea</li>
            <li>Mejora tu precisión con cada práctica</li>
          </ul>
        </div>
        
        <div className="info-column">
          <h3 className="info-title">Categorías disponibles</h3>
          <ul className="info-list">
            <li>Vocales: A, E, I, O, U</li>
            <li>Números: 0-9</li>
            <li>Abecedario: A-Z completo</li>
            <li>Palabras básicas: Saludos y expresiones</li>
            <li>Operaciones: Símbolos matemáticos</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default PracticeSection;
