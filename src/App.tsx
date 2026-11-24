import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import PublicPage from './pages/PublicPage';
import DeveloperPage from './pages/DeveloperPage';
import VaultPage from './pages/VaultPage';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<PublicPage />} />
              <Route path="/developer" element={<DeveloperPage />} />
              <Route path="/vault" element={<VaultPage />} />
              <Route path="/vault/*" element={<VaultPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
