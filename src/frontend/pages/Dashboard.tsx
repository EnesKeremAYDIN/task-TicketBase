import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { getAgents, getDashboard } from '../lib/api';
import { getStoredUser } from '../lib/auth-user';
import type { Agent, DashboardStats, Priority, Status } from '../lib/types';
import { STATUS_LABELS } from '../lib/types';
import Card from '../components/Card/Card';
import ErrorBanner from '../components/ErrorBanner/ErrorBanner';
import Loading from '../components/Loading/Loading';
import PriorityBadge from '../components/PriorityBadge/PriorityBadge';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const user = getStoredUser();
  const isSupportUser = user?.role === 'agent' || user?.role === 'admin';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});
  const [dashboardError, setDashboardError] = useState('');
  const [agentsError, setAgentsError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setDashboardError('');
    setAgentsError('');

    const [dashboardResult, agentsResult] = await Promise.allSettled([
      getDashboard(),
      getAgents(),
    ]);

    if (dashboardResult.status === 'fulfilled') {
      setStats(dashboardResult.value);
    } else {
      setStats(null);
      setDashboardError(
        dashboardResult.reason instanceof Error
          ? dashboardResult.reason.message
          : 'Dashboard yüklenemedi',
      );
    }

    if (agentsResult.status === 'fulfilled') {
      setAgentMap(Object.fromEntries(
        (agentsResult.value as Agent[]).map((agent) => [agent.id, agent.name]),
      ));
    } else {
      setAgentMap({});
      setAgentsError(
        agentsResult.reason instanceof Error
          ? agentsResult.reason.message
          : 'Ajan listesi yüklenemedi',
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (isSupportUser) void load();
  }, [isSupportUser, load]);

  if (!isSupportUser) return <Navigate to="/tickets" replace />;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Aktif destek operasyonunun güncel görünümü</p>
        </div>
        <Link className={styles.primaryLink} to="/tickets">Ticketlara Git</Link>
      </div>

      {dashboardError && <ErrorBanner message={dashboardError} onRetry={load} />}
      {agentsError && <ErrorBanner message={`Ajan listesi: ${agentsError}`} onRetry={load} />}

      {loading ? <Loading /> : stats && (
        <>
          <div className={styles.dashboardGrid}>
            <Card title={`Aktif Durum Dağılımı (${stats.activeTotal})`}>
              {(['new', 'open', 'pending'] as Status[]).map((status) => (
                <div key={status} className={styles.statRow}>
                  <span>{STATUS_LABELS[status]}</span>
                  <strong>{stats.statusBreakdown[status] || 0}</strong>
                </div>
              ))}
            </Card>

            <Card title="Aktif Ticket Öncelikleri">
              {(['urgent', 'high', 'normal', 'low'] as Priority[]).map((priority) => (
                <div key={priority} className={styles.statRow}>
                  <PriorityBadge priority={priority} />
                  <strong>{stats.priorityBreakdown[priority] || 0}</strong>
                </div>
              ))}
            </Card>

            <Card title="Aktif SLA İhlalleri">
              <p className={stats.slaBreached > 0 ? styles.slaDanger : styles.slaSuccess}>
                {stats.slaBreached}
              </p>
              <div className={styles.statRow}>
                <span>İlk yanıt</span>
                <strong>{stats.slaBreachBreakdown.firstResponse}</strong>
              </div>
              <div className={styles.statRow}>
                <span>Çözüm</span>
                <strong>{stats.slaBreachBreakdown.resolution}</strong>
              </div>
            </Card>

            <Card title="Ajan İş Yükü">
              {Object.entries(stats.agentWorkload).length === 0 ? (
                <p className={styles.muted}>Aktif iş yükü bulunmuyor.</p>
              ) : Object.entries(stats.agentWorkload).map(([agentId, count]) => (
                <div key={agentId} className={styles.statRow}>
                  <span>{agentMap[agentId] || 'Bilinmeyen Ajan'}</span>
                  <strong>{count} ticket</strong>
                </div>
              ))}
            </Card>
          </div>

          <Card title="Destek Kuyrukları">
            <div className={styles.queueGrid}>
              {user.role === 'agent' && (
                <Link to="/tickets?queue=my" className={styles.queueLink}>
                  <span>Ticketlarım</span>
                  <strong>{stats.queueCounts.myTickets}</strong>
                </Link>
              )}
              <Link to="/tickets?queue=unassigned" className={styles.queueLink}>
                <span>Atanmamış ve Açık</span>
                <strong>{stats.queueCounts.unassignedOpen}</strong>
              </Link>
              <Link to="/tickets?queue=escalated" className={styles.queueLink}>
                <span>Eskalasyondakiler</span>
                <strong>{stats.queueCounts.escalated}</strong>
              </Link>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
