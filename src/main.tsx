import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './ui/styles.css';
import App from './App';
import { installTouchFeedback } from './ui/motion';

installTouchFeedback();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// offline: o app inteiro (dados oficiais + malhas) fica em cache após a primeira visita
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
