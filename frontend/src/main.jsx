import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/public-sans';
import './styles/index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary
      fallback={
        <main className="status-page">
          <h1>Something went wrong</h1>
          <p>Please reload the page. If it keeps happening, come back in a little while.</p>
          <a className="btn btn-primary" href="/">
            Reload HustleHub+
          </a>
        </main>
      }
    >
      <BrowserRouter>
        <AuthProvider>
          <ChatProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ChatProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
