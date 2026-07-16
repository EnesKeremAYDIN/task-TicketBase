import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { getToken, setToken } from '../../lib/api';
import { useEffect } from 'react';
import Button from '../Button/Button';
import styles from './Layout.module.css';

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const raw = localStorage.getItem('user');
  const user = raw ? JSON.parse(raw) : {};

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
        <span className={styles.brand}>TicketBase</span>
        <Link to="/tickets" className={`${styles.link} ${isActive('/tickets')}`}>Ticketlar</Link>
        <div className={styles.spacer} />
        <span className={styles.userInfo}>{user.name}</span>
        <Button variant="ghost" size="sm" onClick={handleLogout}>Çıkış</Button>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
