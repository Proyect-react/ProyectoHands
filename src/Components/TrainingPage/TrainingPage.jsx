import React from "react";
import "./TrainingPage.css";
import { useNavigate } from "react-router-dom";


const numbers = [
  {
    id: 1,
    title: "Número 1",
    description: "Número uno - índice extendido",
    precision: 0,
    image: "https://picsum.photos/400/250?random=1"
  },
  {
    id: 2,
    title: "Número 2",
    description: "Número dos - índice y medio",
    precision: 0,
    image: "https://picsum.photos/400/250?random=2"
  },
  {
    id: 3,
    title: "Número 3",
    description: "Número tres - tres dedos extendidos",
    precision: 0,
    image: "https://picsum.photos/400/250?random=3"
  },
  {
    id: 4,
    title: "Número 4",
    description: "Número cuatro - mano abierta",
    precision: 0,
    image: "https://picsum.photos/400/250?random=4"
  },
  {
    id: 5,
    title: "Número 5",
    description: "Número cinco - palma extendida",
    precision: 0,
    image: "https://picsum.photos/400/250?random=5"
  },
  {
    id: 6,
    title: "Número 6",
    description: "Número seis - gesto especial",
    precision: 0,
    image: "https://picsum.photos/400/250?random=6"
  }
];


function TrainingPage() {
  
  const navigate = useNavigate();

  return (
    <div className="numbers-container">

      <a href="/" className="volver">← Volver al menú principal</a>

      <h1>Selecciona una Número para Entrenar la IA</h1>
      <p>Toca una opción para empezar a practicar</p>


      <div className="cards-grid">
     
        {numbers.map((num) => (
          <div key={num.id} className="card">
            
   
            <div className="image-container">
              <img src={num.image} alt={num.title} className="imagen" />
     
              <span className="badge">{num.id}</span>
            </div>

     
            <div className="card-body">
      
              <h3>{num.title}</h3>
     
              <p>{num.description}</p>
   
              <p className="precision">Precisión: {num.precision}%</p>

      
              <button 
                className="boton-comenzar"
               
                onClick={() => navigate(`/train/${num.id}`)}

              >
                ▶ Comenzar Práctica
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


export default TrainingPage;