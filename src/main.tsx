import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DesignSystemPage } from './components/DesignSystemPage';
import { initializePreferences } from './preferences/store';
import '@xyflow/react/dist/style.css';
import './themes.css';
import './tokens.css';
import './styles.css';

initializePreferences();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {location.pathname === '/design-system' ? <DesignSystemPage /> : <App />}
  </React.StrictMode>,
);
