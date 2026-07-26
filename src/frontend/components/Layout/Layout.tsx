import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { getToken, setToken } from '../../lib/api';
import { useEffect } from 'react';
import Button from '../Button/Button';
import styles from './Layout.module.css';
import { getStoredUser } from '../../lib/auth-user';

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();
  const isSupportUser = user?.role === 'agent' || user?.role === 'admin';

  useEffect(() => {
    if (!getToken()) navigate('/login');
  }, [navigate]);

  function handleLogout() {
    setToken(null);
    localStorage.removeItem('user');
    navigate('/login');
  }

  function isActive(path: string) {
    return location.pathname.startsWith(path) ? styles.activeLink : '';
  }

  return (
    <div>
      <nav className={styles.nav}>
        <Link to="/" className={styles.brand}>TicketBase</Link>
        {isSupportUser && (
          <Link to="/dashboard" className={`${styles.link} ${isActive('/dashboard')}`}>Dashboard</Link>
        )}
        <Link to="/tickets" className={`${styles.link} ${isActive('/tickets')}`}>Ticketler</Link>
        {user?.role === 'admin' && (
          <Link to="/rules" className={`${styles.link} ${isActive('/rules')}`}>İşletim Kuralları</Link>
        )}
        <div className={styles.spacer} />
        <span className={styles.userInfo}>{user?.name}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout}>Çıkış</Button>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
