import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api';
import Button from '../components/Button/Button';
import Input from '../components/Input/Input';
import Card from '../components/Card/Card';
import styles from './Login.module.css';

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      localStorage.setItem('user', JSON.stringify(user));
      navigate('/tickets');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <Card>
        <h1 className={styles.title}>TicketBase</h1>
        <p className={styles.subtitle}>Multi-Tenant IT Destek Sistemi</p>
        {error && <p className={styles.error}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <Input label="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Şifre" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" loading={loading} className={styles.submitBtn}>Giriş Yap</Button>
        </form>
      </Card>
    </div>
  );
}

export default Login;
