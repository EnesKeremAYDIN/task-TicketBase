import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import TicketList from './pages/TicketList';
import TicketDetail from './pages/TicketDetail';
import Dashboard from './pages/Dashboard';
import Rules from './pages/Rules';
import Automations from './pages/Automations';
import Layout from './components/Layout/Layout';
import { getDefaultPath, getStoredUser } from './lib/auth-user';
import {
  applyTheme,
  getStoredTheme,
  isThemePreference,
  storeTheme,
  THEME_STORAGE_KEY,
} from './lib/theme';

function HomeRedirect() {
  return <Navigate to={getDefaultPath(getStoredUser())} replace />;
}

function App() {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY) {
        setTheme(isThemePreference(event.newValue) ? event.newValue : 'system');
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login theme={theme} onThemeChange={setTheme} />} />
        <Route path="/" element={<Layout theme={theme} onThemeChange={setTheme} />}>
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="tickets" element={<TicketList />} />
          <Route path="tickets/:id" element={<TicketDetail />} />
          <Route path="rules" element={<Rules />} />
          <Route path="automations" element={<Automations />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
