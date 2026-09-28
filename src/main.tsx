import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthWrapper, LoginGate } from './auth/ClerkWrapper.tsx';
import { ThemeProvider } from './theme/Theme.tsx';
import { ToastProvider } from './components/Toaster.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthWrapper>
      <ThemeProvider>
        <ToastProvider>
          <LoginGate>
            <App />
          </LoginGate>
        </ToastProvider>
      </ThemeProvider>
    </AuthWrapper>
  </StrictMode>,
);
