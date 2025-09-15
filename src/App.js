import './App.css';
import { BrowserRouter as Router, Routes, Route, BrowserRouter } from 'react-router-dom';
import Header from './Components/Header/Header';
import HomePage from './Components/HomePage/HomePage';
import Entrenamiento from './Components/Entrenamiento/Entrenamiento';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/entrenamiento" element={<Entrenamiento />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
