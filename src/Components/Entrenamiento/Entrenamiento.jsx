import React from "react";
import "./Entrenamiento.css";
import { useNavigate } from "react-router-dom";

function Entrenamiento () {
    const navigate = useNavigate();

    return (
        <div className="Entrenamiento">
        <div className="Titulo">
            <button className="Button" onClick={() => navigate("/")}>
                Volver al Inicio
            </button>
            <h2>Crea y Entrena Modelos Personalizados</h2>
            <button className="Entrenar">Entrenar Modelo</button>
        </div>
        <div className="Modelos">
            <tr>Mis Modelos</tr>
        </div>
        </div>
        
    );
}

export default Entrenamiento;