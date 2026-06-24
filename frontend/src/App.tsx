import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { AuthForm } from './components/AuthForm';
import { Dashboard } from './components/Dashboard';
import { LandingPage } from './components/LandingPage';
import { TermsOfService } from './components/TermsOfService';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { GlobalModals } from './components/GlobalModals';

function App() {
  const token = useAuthStore((state) => state.token);

  return (
    <>
      <Routes>
        <Route path="/" element={token ? <Navigate to="/app" /> : <LandingPage />} />
        <Route path="/auth" element={token ? <Navigate to="/app" /> : <AuthForm />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/app/*" element={token ? <Dashboard /> : <Navigate to="/auth" />} />
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <GlobalModals />
    </>
  );
}

export default App;