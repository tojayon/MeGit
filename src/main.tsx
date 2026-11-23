import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DesktopWindow } from './components/DesktopWindow';
import { DesignSystemPage } from './components/DesignSystemPage';
import { initializePreferences } from './preferences/store';
import '@xyflow/react/dist/style.css';
import './themes.css';
import './tokens.css';
import './styles.css';

initializePreferences();
const app = location.pathname === '/design-system' ? <DesignSystemPage /> : <App />;
const desktop = window.megitDesktop;
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {desktop ? <DesktopWindow invoke={desktop}>{app}</DesktopWindow> : app}
  </React.StrictMode>,
);
