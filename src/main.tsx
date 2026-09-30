import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './estilos.css';

const raiz = document.getElementById('raiz');

if (!raiz) {
  throw new Error('Elemento raiz não encontrado no documento.');
}

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
