import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './i18n';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Hide the loader once React has mounted
const loader = document.getElementById('app-loader');
if (loader) loader.style.display = 'none';
