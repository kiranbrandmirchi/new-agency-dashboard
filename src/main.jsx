/**
 * Inline CSS via JS so styles always apply when the app bundle loads.
 * (Separate <link> CSS chunks can 404 behind proxies, strict CORP, or bad preview paths.)
 */
import appCss from './styles/style.css?inline';
import utilCss from './styles/utilities.css?inline';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import App from './App';

if (!document.getElementById('wow-dashboard-global-styles')) {
  const g = document.createElement('style');
  g.id = 'wow-dashboard-global-styles';
  g.textContent = `${appCss}\n${utilCss}`;
  document.head.prepend(g);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(400px); opacity: 0; }
  }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
