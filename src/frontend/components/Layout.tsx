import { Outlet, Link, useNavigate } from 'react-router-dom';
import { getToken, setToken } from '../lib/api';
import { useEffect } from 'react';

function Layout() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    if (!getToken()) navigate('/login');
  }, [navigate]);

  function handleLogout() {
    setToken(null);
    localStorage.removeItem('user');
    navigate('/login');
  }

  return (
    <div>
      <nav style={{ display: 'flex', gap: 16, padding: 12, borderBottom: '1px solid #ccc', alignItems: 'center' }}>
        <strong>TicketBase</strong>
        <Link to="/tickets">Ticketlar</Link>
        <Link to="/dashboard">Dashboard</Link>
        {user.role === 'admin' && <Link to="/rules">Kurallar</Link>}
        <span style={{ flex: 1 }} />
        <span>{user.name}</span>
        <button onClick={handleLogout}>Çıkış</button>
      </nav>
      <main style={{ padding: 16 }}>
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
