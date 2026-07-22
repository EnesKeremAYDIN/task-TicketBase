import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTickets, createTicket, claimTicket, getDashboard, getRules, getAgents } from '../lib/api';
import type { Ticket, Priority, Agent } from '../lib/types';
import Card from '../components/Card/Card';
import StatusBadge from '../components/StatusBadge/StatusBadge';
import PriorityBadge from '../components/PriorityBadge/PriorityBadge';
import Pagination from '../components/Pagination/Pagination';
import Button from '../components/Button/Button';
import Input from '../components/Input/Input';
import Select from '../components/Select/Select';
import Textarea from '../components/Textarea/Textarea';
import Loading from '../components/Loading/Loading';
import EmptyState from '../components/EmptyState/EmptyState';
import styles from './TicketList.module.css';

interface DashboardStats {
  statusBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  slaBreached: number;
  agentWorkload: Record<string, number>;
}

interface Rule { kural: string; deger: string; }

function TicketList() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrio, setNewPrio] = useState('normal');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [agentOptions, setAgentOptions] = useState<{ value: string; label: string }[]>([]);
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});

  let user = {};
  try {
    const raw = localStorage.getItem('user');
    if (raw) user = JSON.parse(raw);
  } catch {
    user = {};
  }

  const userRole = (user as { role?: string }).role;
  const isAgent = userRole === 'agent' || userRole === 'admin';
  const canViewTickets = userRole === 'customer' || isAgent;

  const statusLabels: Record<string, string> = {
    new: 'Yeni', open: 'Açık', pending: 'Beklemede', resolved: 'Çözüldü', closed: 'Kapalı',
  };

  const load = useCallback(async () => {
    if (!canViewTickets) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(limit) };
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (agentFilter) params.assignedToId = agentFilter;
      if (search) params.search = search;
      const data = await listTickets(params);
      setTickets(data.tickets);
      setTotal(data.total);
    } catch {
      setTickets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, priorityFilter, agentFilter, search, canViewTickets]);

  useEffect(() => {
    if (isAgent) {
      Promise.all([getDashboard(), getRules(), getAgents()])
        .then(([s, r, agents]) => {
          setStats(s as DashboardStats);
          setRules((r as { rules: Rule[] }).rules);
          const agentList = agents as Agent[];
          setAgentOptions([
            { value: '', label: 'Tümü' },
            { value: 'unassigned', label: 'Atanmamış' },
            ...agentList.map((a) => ({ value: a.id, label: a.name })),
          ]);
          setAgentMap(Object.fromEntries(agentList.map((a) => [a.id, a.name])));
        })
        .catch(() => {});
    }
    load();
  }, [load, isAgent]);

  function handleSearch() {
    setPage(1);
  }

  function handleFilterChange() {
    setPage(1);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const createdTicket = await createTicket({ title: newTitle, description: newDesc, priority: newPrio as Priority });
      setShowCreate(false);
      setNewTitle('');
      setNewDesc('');
      setNewPrio('normal');
      navigate(`/tickets/${createdTicket.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hata');
    }
  }

  async function handleClaim(id: string) {
    await claimTicket(id);
    load();
    if (isAgent) getDashboard().then((s) => setStats(s as DashboardStats)).catch(() => {});
  }

  function handleRowClick(ticketId: string) {
    navigate(`/tickets/${ticketId}`);
  }

  function handleRowKeyDown(e: React.KeyboardEvent, ticketId: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`/tickets/${ticketId}`);
    }
  }

  const statusOptions = [
    { value: '', label: 'Tümü' },
    { value: 'new', label: 'Yeni' },
    { value: 'open', label: 'Açık' },
    { value: 'pending', label: 'Beklemede' },
    { value: 'resolved', label: 'Çözüldü' },
    { value: 'closed', label: 'Kapalı' },
  ];

  const priorityOptions = [
    { value: '', label: 'Tümü' },
    { value: 'low', label: 'Düşük' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'Yüksek' },
    { value: 'urgent', label: 'Acil' },
  ];

  return (
    <div>
      {isAgent && stats && (
        <div className={styles.dashboardGrid}>
          <Card title="Durum Dağılımı">
            {(['new', 'open', 'pending', 'resolved', 'closed'] as const).map((k) => (
              <div key={k} className={styles.statRow}>
                <span>{statusLabels[k]}</span>
                <strong>{stats.statusBreakdown[k] || 0}</strong>
              </div>
            ))}
          </Card>
          <Card title="Öncelik Dağılımı">
            {(['urgent', 'high', 'normal', 'low'] as const).map((k) => (
              <div key={k} className={styles.statRow}>
                <PriorityBadge priority={k} />
                <strong>{stats.priorityBreakdown[k] || 0}</strong>
              </div>
            ))}
          </Card>
          <Card title="SLA İhlalleri">
            <p className={styles.slaCount} style={{ color: stats.slaBreached > 0 ? 'var(--danger)' : 'var(--success)' }}>
              {stats.slaBreached}
            </p>
            {stats.slaBreached > 0 && <p className={styles.slaText}>Ticket SLA süresini aştı</p>}
          </Card>
          <Card title="Ajan İş Yükü">
            {Object.entries(stats.agentWorkload).length === 0 ? (
              <p className={styles.slaText}>Ajan bulunamadı</p>
            ) : (
              Object.entries(stats.agentWorkload).map(([k, v]) => (
                <div key={k} className={styles.statRow}>
                  <span>{agentMap[k] || 'Bilinmeyen Ajan'}</span>
                  <strong>{v} ticket</strong>
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      <div className={styles.headerRow}>
        <h2 className={styles.headerTitle}>Ticket Listesi</h2>
        {(user as { role?: string }).role === 'customer' && (
          <Button onClick={() => setShowCreate(!showCreate)} variant={showCreate ? 'secondary' : 'primary'}>
            {showCreate ? 'İptal' : 'Yeni Ticket'}
          </Button>
        )}
      </div>

      {showCreate && (
        <Card className={styles.createCard}>
          <form onSubmit={handleCreate}>
            <Input label="Başlık" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
            <Textarea label="Açıklama" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} required />
            <Select label="Öncelik" value={newPrio} onChange={(e) => setNewPrio(e.target.value)} options={[
              { value: 'low', label: 'Düşük' }, { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'Yüksek' }, { value: 'urgent', label: 'Acil' },
            ]} />
            {error && <p className={styles.errorText}>{error}</p>}
            <Button type="submit" style={{ marginTop: 8 }}>Oluştur</Button>
          </form>
        </Card>
      )}

      {isAgent && (
        <div className={styles.filterRow}>
          <div className={styles.filterSelect}>
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); handleFilterChange(); }} options={statusOptions} />
          </div>
          <div className={styles.filterSelect}>
            <Select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); handleFilterChange(); }} options={priorityOptions} />
          </div>
          <div className={styles.filterSelectWide}>
            <Select value={agentFilter} onChange={(e) => { setAgentFilter(e.target.value); handleFilterChange(); }} options={agentOptions} />
          </div>
          <div className={styles.searchGroup}>
            <div className={styles.searchInput}>
              <Input placeholder="Ara..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            </div>
            <Button variant="secondary" size="sm" onClick={handleSearch}>Ara</Button>
          </div>
        </div>
      )}

      <Pagination page={page} total={total} limit={limit} onChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1); }} />

      {loading ? <Loading /> : tickets.length === 0 ? (
        <EmptyState
          title="Ticket bulunamadı"
          description={isAgent ? 'Filtreleri değiştirmeyi deneyin.' : 'Yeni bir ticket oluşturarak başlayabilirsiniz.'}
        />
      ) : (
        <Card>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>No</th><th>Başlık</th><th>Durum</th><th>Öncelik</th><th>Müşteri</th><th>Ajan</th><th>Son Yorum</th><th></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr
                  key={t.id}
                  className={styles.clickableRow}
                  onClick={() => handleRowClick(t.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, t.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ticket ${t.displayId}: ${t.title}`}
                >
                  <td>{t.displayId}</td>
                  <td className={styles.cellTitle}>{t.title}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td>{t.customer?.name}</td>
                  <td>{t.assignedTo?.name || '-'}</td>
                  <td className={styles.cellLastComment}>
                    {t.lastComment ? `${t.lastComment.author.name}: ${t.lastComment.body}` : '-'}
                  </td>
                  <td>
                    {(user as { role?: string }).role === 'agent' && !t.assignedTo && t.status !== 'closed' && (
                      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleClaim(t.id); }}>Üstlen</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Pagination page={page} total={total} limit={limit} onChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1); }} />

      {isAgent && rules.length > 0 && (user as { role?: string }).role === 'admin' && (
        <Card title="İşletim Kuralları" style={{ marginTop: 24 }}>
          <table className={styles.rulesTable}>
            <thead>
              <tr>
                <th>Kural</th>
                <th>Değer</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i}>
                  <td>{r.kural}</td>
                  <td><strong>{r.deger}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export default TicketList;
