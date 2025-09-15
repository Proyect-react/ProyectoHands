// src/components/HomePage.jsx
import "./HomePage.css";
import Header from "../Header/Header";

 function HomePage() {
  return (
    <><Header /><div className="estilos">
      <h1>Aprende Vocales con IA</h1>
      <p>Sistema inteligente de reconocimiento de gestos para identificar vocales con las manos.</p>

      <button className="Button">Entrenar Modelo</button>

      <div className="progreso">
        <h3>Tu Progreso</h3>
        <ul>
          <li>Vocales Detectadas: 1/5</li>
          <li>Precisión Promedio: 68.3%</li>
          <li>Sesiones Totales: 2</li>
          <li>Tiempo Total: 1m</li>
        </ul>
      </div>
    </div></>
  );
}
export default HomePage;