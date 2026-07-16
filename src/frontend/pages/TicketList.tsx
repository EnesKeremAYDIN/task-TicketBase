import { useState, useEffect } from 'react';
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
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const isAgent = user.role === 'agent' || user.role === 'admin';

  const statusLabels: Record<string, string> = {
    new: 'Yeni', open: 'Açık', pending: 'Beklemede', resolved: 'Çözüldü', closed: 'Kapalı',
  };

  async function load() {
    if (!isAgent) return;
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
  }

  useEffect(() => {
    if (isAgent) {
      Promise.all([getDashboard(), getRules(), getAgents()]).then(([s, r, agents]) => {
        setStats(s as DashboardStats);
        setRules((r as { rules: Rule[] }).rules);
        const agentList = agents as Agent[];
        setAgentOptions([
          { value: '', label: 'Tümü' },
          { value: 'unassigned', label: 'Atanmamış' },
          ...agentList.map((a) => ({ value: a.id, label: a.name })),
        ]);
        setAgentMap(Object.fromEntries(agentList.map((a) => [a.id, a.name])));
      });
    }
    load();
  }, []);

  useEffect(() => {
    if (isAgent) load();
  }, [page, limit]);

  function handleSearch() {
    setPage(1);
    load();
  }

  function handleFilterChange() {
    setPage(1);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createTicket({ title: newTitle, description: newDesc, priority: newPrio as Priority });
      setShowCreate(false);
      setNewTitle('');
      setNewDesc('');
      setNewPrio('normal');
      load();
      if (isAgent) getDashboard().then((s) => setStats(s as DashboardStats));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hata');
    }
  }

  async function handleClaim(id: string) {
    await claimTicket(id);
    load();
    if (isAgent) getDashboard().then((s) => setStats(s as DashboardStats));
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Card title="Durum Dağılımı">
            {Object.entries(stats.statusBreakdown).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.85rem' }}>
                <span>{statusLabels[k] || k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </Card>
          <Card title="Öncelik Dağılımı">
            {Object.entries(stats.priorityBreakdown).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.85rem' }}>
                <PriorityBadge priority={k as 'low' | 'normal' | 'high' | 'urgent'} />
                <strong>{v}</strong>
              </div>
            ))}
          </Card>
          <Card title="SLA İhlalleri">
            <p style={{ fontSize: '1.8rem', fontWeight: 700, color: stats.slaBreached > 0 ? 'var(--danger)' : 'var(--success)', margin: 0 }}>
              {stats.slaBreached}
            </p>
            {stats.slaBreached > 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Ticket SLA süresini aştı</p>}
          </Card>
          <Card title="Ajan İş Yükü">
            {Object.entries(stats.agentWorkload).length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Ajan bulunamadı</p>
            ) : (
              Object.entries(stats.agentWorkload).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '0.85rem' }}>
                  <span>{agentMap[k] || 'Bilinmeyen Ajan'}</span>
                  <strong>{v} ticket</strong>
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.3rem' }}>Ticket Listesi</h2>
        {user.role === 'customer' && (
          <Button onClick={() => setShowCreate(!showCreate)} variant={showCreate ? 'secondary' : 'primary'}>
            {showCreate ? 'İptal' : 'Yeni Ticket'}
          </Button>
        )}
      </div>

      {showCreate && (
        <Card style={{ marginBottom: 16 }}>
          <form onSubmit={handleCreate}>
            <Input label="Başlık" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
            <Textarea label="Açıklama" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} required />
            <Select label="Öncelik" value={newPrio} onChange={(e) => setNewPrio(e.target.value)} options={[
              { value: 'low', label: 'Düşük' }, { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'Yüksek' }, { value: 'urgent', label: 'Acil' },
            ]} />
            {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
            <Button type="submit" style={{ marginTop: 8 }}>Oluştur</Button>
          </form>
        </Card>
      )}

      {isAgent && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 160 }}>
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); handleFilterChange(); }} options={statusOptions} />
          </div>
          <div style={{ width: 160 }}>
            <Select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); handleFilterChange(); }} options={priorityOptions} />
          </div>
          <div style={{ width: 180 }}>
            <Select value={agentFilter} onChange={(e) => { setAgentFilter(e.target.value); handleFilterChange(); }} options={agentOptions} />
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1, minWidth: 200 }}>
            <div style={{ flex: 1 }}>
              <Input placeholder="Ara..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            </div>
            <Button variant="secondary" size="sm" onClick={handleSearch}>Ara</Button>
          </div>
        </div>
      )}

      {isAgent && <Pagination page={page} total={total} limit={limit} onChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1); }} />}

      {!isAgent ? (
        <Card>
          <p>Müşteri olarak ticket listesini görüntüleyemezsiniz.</p>
        </Card>
      ) : loading ? <Loading /> : tickets.length === 0 ? (
        <EmptyState title="Ticket bulunamadı" description="Filtreleri değiştirmeyi deneyin." />
      ) : (
        <Card>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>No</th><th>Başlık</th><th>Durum</th><th>Öncelik</th><th>Müşteri</th><th>Ajan</th><th>Son Yorum</th><th></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tickets/${t.id}`)}>
                  <td>{t.displayId}</td>
                  <td style={{ fontWeight: 500 }}>{t.title}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td>{t.customer?.name}</td>
                  <td>{t.assignedTo?.name || '-'}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.lastComment ? `${t.lastComment.author.name}: ${t.lastComment.body}` : '-'}
                  </td>
                  <td>
                    {user.role === 'agent' && !t.assignedTo && t.status !== 'closed' && (
                      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleClaim(t.id); }}>Üstlen</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {isAgent && <Pagination page={page} total={total} limit={limit} onChange={setPage} onLimitChange={(l) => { setLimit(l); setPage(1); }} />}

      {isAgent && rules.length > 0 && user.role === 'admin' && (
        <Card title="İşletim Kuralları" style={{ marginTop: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
