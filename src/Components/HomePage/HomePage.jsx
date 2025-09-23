// src/components/HomePage.jsx
import "./HomePage.css";
import Header from "../Header/Header";
import { useNavigate } from "react-router-dom";

function HomePage() {
  const navigate = useNavigate();

  const handleTrainingClick = () => {
    navigate("TrainingPage.jsx"); // para navegar a la pagina  de entrenamiento telaaa pero yo tengo codigo completo 
  };

  return (
    <form>
      <>
        <Header />
        <div className="titulo">
          <h1 className="subtitulo">Fácil y Paso a Paso</h1>
          <p className="description">
            Primero enseñas a la computadora tus señas. Después ella te ayuda a
            practicar. Todo muy simple y con voz que te guía.
          </p>
        </div>

        <div className="main-container">
          {/* Dos Pasos Simples */}
          <h2 className="sub">Dos Pasos Simples</h2>
          <div className="steps-container">
            <div className="card-paso1">
              <div className="step-icon">🧠</div>
              <h3>Paso 1: Enseñar</h3>
              <p>
                Le enseñas a la computadora cómo haces las señas. Solo necesitas
                hacer cada seña 5 veces.
              </p>
              <span className="simulador">Estado: 1/4 modos listos</span>
            </div>

            <div className="card-paso2">
              <div className="step-icon">🎓</div>
              <h3>Paso 2: Practicar</h3>
              <p>
                Ahora practicas y la computadora te dice si lo haces bien. Te
                ayuda con voz amigable.
              </p>
              <span className="simulador">
                Necesitas completar el Paso 1 primero
              </span>
            </div>
          </div>

        

          <div className="categories-container">
            <div className="card-blue">
              <h4>Vocales</h4>
              <p>Aprende las 5 vocales básicas en pocos intentos.</p>
              <div className="button">
                <button className="boton-enseñar">Enseñar</button>
                <button className="boton-practicar">Practicar</button>
              </div>
            </div>

            <div className="card-green">
              <h4>Palabras</h4>
              <p>Practica palabras comunes y útiles del día a día.</p>
              <div className="button">
                <button className="boton-enseñar">Enseñar</button>
                <button className="boton-practicar">Practicar</button>
              </div>
            </div>

            <div className="card-orange">
              <h4>Números</h4>
              <p>Domina los números del 1 al 10 fácilmente.</p>
              <div className="button">
                <button className="boton-enseñar">Enseñar</button>
                <button className="boton-practicar">Practicar</button>
              </div>
            </div>

            <div className="card-purple">
              <h4>Aritmética</h4>
              <p>Aprende operaciones matemáticas básicas</p>
              <div className="button">
                <button className="boton-enseñar">Enseñar</button>
                <button className="boton-practicar">Practicar</button>
              </div>
            </div>
          </div>
        </div>
      </>
    </form>
  );
}

export default HomePage;