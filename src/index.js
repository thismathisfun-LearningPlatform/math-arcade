import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Minimal storage API backed by localStorage (used by the app)
if (!window.storage) {
  window.storage = {
    get: async (key, _isShared) => {
      const v = localStorage.getItem(key);
      return { value: v || JSON.stringify({}) };
    },
    set: async (key, value, _isShared) => {
      localStorage.setItem(key, value);
    }
  };
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
