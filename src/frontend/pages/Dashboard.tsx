import { useState, useEffect } from 'react';
import { getDashboard, getSlaBreaches } from '../lib/api';

function Dashboard() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [breaches, setBreaches] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    getDashboard().then(setStats);
    getSlaBreaches().then(setBreaches);
  }, []);

  if (!stats) return <div>Yükleniyor...</div>;

  return (
    <div>
      <h2>Dashboard</h2>

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h3>Durum Dağılımı</h3>
          <ul>
            {Object.entries(stats.statusBreakdown).map(([k, v]) => (
              <li key={k}>{k}: {String(v)}</li>
            ))}
          </ul>
        </div>

        <div style={{ flex: 1 }}>
          <h3>Öncelik Dağılımı</h3>
          <ul>
            {Object.entries(stats.priorityBreakdown).map(([k, v]) => (
              <li key={k}>{k}: {String(v)}</li>
            ))}
          </ul>
        </div>

        <div style={{ flex: 1 }}>
          <h3>SLA İhlalleri</h3>
          <p style={{ fontSize: 24, color: stats.slaBreached > 0 ? 'red' : 'green' }}>
            {stats.slaBreached}
          </p>
        </div>

        <div style={{ flex: 1 }}>
          <h3>Ajan İş Yükü</h3>
          <ul>
            {Object.entries(stats.agentWorkload).map(([k, v]) => (
              <li key={k} style={{ fontSize: 12 }}>Ajan: {String(v)} ticket</li>
            ))}
          </ul>
        </div>
      </div>

      {breaches && breaches.tickets?.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>SLA İhlal Listesi</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th>No</th><th>Başlık</th><th>Durum</th><th>Öncelik</th>
              </tr>
            </thead>
            <tbody>
              {breaches.tickets.map((t: Record<string, unknown>) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td>{t.displayId}</td>
                  <td>{t.title}</td>
                  <td>{t.status}</td>
                  <td>{t.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
