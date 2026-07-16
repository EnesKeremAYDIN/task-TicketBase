import { useState, useEffect } from 'react';
import { getDashboard, getSlaBreaches, getAgents } from '../lib/api';
import type { DashboardStats, Ticket, Agent } from '../lib/types';
import Card from '../components/Card/Card';
import StatusBadge from '../components/StatusBadge/StatusBadge';
import PriorityBadge from '../components/PriorityBadge/PriorityBadge';
import Loading from '../components/Loading/Loading';

function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [breaches, setBreaches] = useState<{ tickets: Ticket[] } | null>(null);
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([getDashboard(), getSlaBreaches(), getAgents()]).then(([s, b, agents]) => {
      setStats(s);
      setBreaches(b);
      setAgentMap(Object.fromEntries((agents as Agent[]).map((a) => [a.id, a.name])));
    });
  }, []);

  if (!stats) return <Loading />;

  const statusLabels: Record<string, string> = { new: 'Yeni', open: 'Açık', pending: 'Beklemede', resolved: 'Çözüldü', closed: 'Kapalı' };

  return (
    <div>
      <h2 style={{ fontSize: '1.3rem', marginBottom: 16 }}>Dashboard</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card title="Durum Dağılımı">
          {Object.entries(stats.statusBreakdown).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.9rem' }}>
              <span>{statusLabels[k] || k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </Card>

        <Card title="Öncelik Dağılımı">
          {Object.entries(stats.priorityBreakdown).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.9rem' }}>
              <span><PriorityBadge priority={k as 'low' | 'normal' | 'high' | 'urgent'} /></span>
              <strong>{v}</strong>
            </div>
          ))}
        </Card>

        <Card title="SLA İhlalleri">
          <p style={{ fontSize: '2rem', fontWeight: 700, color: stats.slaBreached > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {stats.slaBreached}
          </p>
          {stats.slaBreached > 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Ticket SLA süresini aştı</p>}
        </Card>

        <Card title="Ajan İş Yükü">
          {Object.entries(stats.agentWorkload).length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Ajan bulunamadı</p>
          ) : (
            Object.entries(stats.agentWorkload).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.9rem' }}>
                <span>{agentMap[k] || 'Bilinmeyen Ajan'}</span>
                <strong>{v} ticket</strong>
              </div>
            ))
          )}
        </Card>
      </div>

      {breaches && breaches.tickets?.length > 0 && (
        <Card title="SLA İhlal Listesi">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>No</th><th>Başlık</th><th>Durum</th><th>Öncelik</th>
              </tr>
            </thead>
            <tbody>
              {breaches.tickets.map((t) => (
                <tr key={t.id}>
                  <td>{t.displayId}</td>
                  <td>{t.title}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td><PriorityBadge priority={t.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export default Dashboard;
