import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/api';

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const user = await login(email, password);
      localStorage.setItem('user', JSON.stringify(user));
      navigate('/tickets');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız');
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '100px auto' }}>
      <h1>TicketBase</h1>
      <p>Multi-Tenant IT Destek Sistemi</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>E-posta</label><br />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%' }} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label>Şifre</label><br />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%' }} />
        </div>
        <button type="submit" style={{ marginTop: 16, width: '100%' }}>Giriş Yap</button>
      </form>
    </div>
  );
}

export default Login;
