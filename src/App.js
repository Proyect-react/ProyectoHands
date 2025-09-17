import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './Components/HomePage/HomePage';
import TrainingPage from './Components/TrainingPage/TrainingPage';
import EntrenarNumeros from './Components/Entrenar/EntrenarNumeros/EntrenarNumeros';
import EntrenarVocales from './Components/Entrenar/EntrenarVocales/EntrenarVocales';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/EntrenarVocales" element={<EntrenarVocales/>} />
          <Route path="/EntrenarNumeros" element={<EntrenarNumeros/>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
