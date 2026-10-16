import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Login from './pages/Login';
import Home from './pages/Home';
import './styles.css';

function Gate() {
  const { email, loading } = useAuth();
  if (loading) return null;
  if (!email) return <Login />;
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
