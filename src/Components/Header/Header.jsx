import React from "react";
import "./Headerstyle.css";

function Header() {
    return (
        <div className="Header">
            <div className="container">
                <h2> Signlearn AI</h2>
                <h5>Sistema de Entrenamiento con IA</h5>
            </div>
            <div className="Header2">
                <div>
                    <h5> Entrenamiento de Vocales</h5>
                    <h2> Lenguaje de Señas</h2>
                </div>
            </div>
        </div>
    )
}

export default Header