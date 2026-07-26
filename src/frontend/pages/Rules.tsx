import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getRules } from '../lib/api';
import { getStoredUser } from '../lib/auth-user';
import type { OperatingRule } from '../lib/types';
import Card from '../components/Card/Card';
import ErrorBanner from '../components/ErrorBanner/ErrorBanner';
import Loading from '../components/Loading/Loading';
import styles from './Rules.module.css';

export default function Rules() {
  const user = getStoredUser();
  const [rules, setRules] = useState<OperatingRule[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getRules();
      setRules(response.rules);
    } catch (loadError) {
      setRules([]);
      setError(loadError instanceof Error ? loadError.message : 'İşletim kuralları yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') void load();
  }, [load, user?.role]);

  if (user?.role !== 'admin') return <Navigate to="/tickets" replace />;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>İşletim Kuralları</h1>
        <p className={styles.subtitle}>Destek operasyonunda uygulanan sabit servis politikaları</p>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? <Loading /> : (
        <Card>
          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>Kural</th>
                  <th>Değer</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.kural}>
                    <td>{rule.kural}</td>
                    <td><strong>{rule.deger}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
