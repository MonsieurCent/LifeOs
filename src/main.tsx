import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';

// Suppress third-party extension / MetaMask / Vite HMR websocket disconnect noise in sandboxed iframe
const isIgnorableRuntimeError = (err: unknown): boolean => {
  if (!err) return false;
  try {
    const msg = typeof err === 'string'
      ? err
      : typeof (err as any).message === 'string'
        ? (err as any).message
        : (err as any).reason
          ? (typeof (err as any).reason === 'string' ? (err as any).reason : (err as any).reason?.message || String((err as any).reason))
          : String(err);
    const lower = msg.toLowerCase();
    return (
      lower.includes('metamask') ||
      lower.includes('ethereum') ||
      lower.includes('web3') ||
      lower.includes('evm') ||
      lower.includes('websocket closed') ||
      lower.includes('failed to connect to websocket') ||
      lower.includes('closed without opened') ||
      lower.includes('[vite]') ||
      lower.includes('vite') && lower.includes('websocket')
    );
  } catch {
    return false;
  }
};

window.addEventListener('unhandledrejection', (event) => {
  if (isIgnorableRuntimeError(event.reason)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

window.addEventListener('error', (event) => {
  if (isIgnorableRuntimeError(event.message) || isIgnorableRuntimeError(event.error)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

