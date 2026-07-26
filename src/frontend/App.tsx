import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import TicketList from './pages/TicketList';
import TicketDetail from './pages/TicketDetail';
import Dashboard from './pages/Dashboard';
import Rules from './pages/Rules';
import Automations from './pages/Automations';
import Layout from './components/Layout/Layout';
import { getDefaultPath, getStoredUser } from './lib/auth-user';

function HomeRedirect() {
  return <Navigate to={getDefaultPath(getStoredUser())} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
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
