import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTickets, createTicket, bulkUpdateTickets, claimTicket, getDashboard, getRules, getAgents } from '../lib/api';
import type {
  Ticket,
  Priority,
  Status,
  Agent,
  BulkTicketOperation,
  BulkTicketResult,
  DashboardStats,
  TicketQueue,
} from '../lib/types';
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
import Modal from '../components/Modal/Modal';
import styles from './TicketList.module.css';

interface Rule { kural: string; deger: string; }

function TicketList() {
  const navigate = useNavigate();
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

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [queueFilter, setQueueFilter] = useState<TicketQueue | ''>(
    userRole === 'agent' ? 'my' : '',
  );
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
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [bulkOperation, setBulkOperation] = useState('');
  const [bulkStatus, setBulkStatus] = useState<Exclude<Status, 'new'>>('open');
  const [bulkPriority, setBulkPriority] = useState<Priority>('normal');
  const [bulkAgentId, setBulkAgentId] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkPendingUntil, setBulkPendingUntil] = useState('');
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkTicketResult | null>(null);
  const [bulkError, setBulkError] = useState('');

  const statusLabels: Record<string, string> = {
    new: 'Yeni', open: 'Açık', pending: 'Beklemede', resolved: 'Çözüldü', closed: 'Kapalı',
  };

  const load = useCallback(async () => {
    if (!canViewTickets) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(limit) };
      if (queueFilter) params.queue = queueFilter;
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
  }, [page, limit, queueFilter, statusFilter, priorityFilter, agentFilter, search, canViewTickets]);

  useEffect(() => {
    if (isAgent) {
      Promise.all([getDashboard(), getAgents()])
        .then(([dashboard, agents]) => {
          setStats(dashboard);
          const agentList = agents as Agent[];
          setAgentOptions([
            { value: '', label: 'Tümü' },
            ...agentList.map((a) => ({ value: a.id, label: a.name })),
          ]);
          setAgentMap(Object.fromEntries(agentList.map((a) => [a.id, a.name])));
        })
        .catch(() => {});

      if (userRole === 'admin') {
        getRules()
          .then((response) => setRules((response as { rules: Rule[] }).rules))
          .catch(() => {});
      } else {
        setRules([]);
      }
    }
    load();
  }, [load, isAgent, userRole]);

  useEffect(() => {
    setSelectedTicketIds([]);
    setBulkResult(null);
  }, [page, limit, queueFilter, statusFilter, priorityFilter, agentFilter, search]);

  function handleSearch() {
    setPage(1);
  }

  function handleFilterChange() {
    setPage(1);
  }

  function handleQueueChange(queue: TicketQueue | '') {
    setQueueFilter(queue);
    setAgentFilter('');
    setPage(1);
  }

  function handleAgentFilterChange(agentId: string) {
    setAgentFilter(agentId);
    setQueueFilter('');
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

  function toggleTicketSelection(ticketId: string) {
    setSelectedTicketIds((current) => (
      current.includes(ticketId)
        ? current.filter((id) => id !== ticketId)
        : [...current, ticketId]
    ));
    setBulkResult(null);
  }

  function toggleCurrentPageSelection() {
    const pageIds = tickets.map((ticket) => ticket.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedTicketIds.includes(id));
    setSelectedTicketIds(allSelected ? [] : pageIds);
    setBulkResult(null);
  }

  function prepareBulkOperation() {
    setBulkError('');
    if (!bulkOperation || selectedTicketIds.length === 0) return;

    if (bulkOperation === 'status') {
      const includesClosedTicket = tickets.some((ticket) => (
        selectedTicketIds.includes(ticket.id) && ticket.status === 'closed'
      ));
      if (bulkStatus === 'pending' && (!bulkPendingUntil || !bulkReason.trim())) {
        setBulkError('Pending işlemi için tarih ve neden zorunludur.');
        return;
      }
      if (bulkStatus === 'pending') {
        const pendingDate = new Date(bulkPendingUntil);
        if (Number.isNaN(pendingDate.getTime()) || pendingDate <= new Date()) {
          setBulkError('Pending bitiş tarihi gelecekte olmalıdır.');
          return;
        }
      }
      if (bulkStatus === 'open' && includesClosedTicket && !bulkReason.trim()) {
        setBulkError('Kapalı ticketları yeniden açmak için neden zorunludur.');
        return;
      }
    }

    if (bulkOperation === 'assign' && userRole === 'admin' && !bulkAgentId) {
      setBulkError('Atanacak ajanı veya atamayı kaldır seçeneğini belirleyin.');
      return;
    }

    setShowBulkConfirm(true);
  }

  async function executeBulkOperation() {
    if (!bulkOperation || selectedTicketIds.length === 0) return;

    setBulkLoading(true);
    setBulkError('');
    try {
      let operation: BulkTicketOperation;
      if (bulkOperation === 'status') {
        operation = {
          type: 'status',
          status: bulkStatus,
          pendingUntil: bulkStatus === 'pending' ? new Date(bulkPendingUntil).toISOString() : undefined,
          reason: bulkReason.trim() || undefined,
        };
      } else if (bulkOperation === 'priority') {
        operation = { type: 'priority', priority: bulkPriority };
      } else {
        operation = {
          type: 'assign',
          agentId: userRole === 'agent'
            ? (user as { id?: string }).id || null
            : bulkAgentId === 'unassigned' ? null : bulkAgentId,
        };
      }

      const result = await bulkUpdateTickets(selectedTicketIds, operation);
      setBulkResult(result);
      setShowBulkConfirm(false);
      await load();
      setSelectedTicketIds(result.failed.map((item) => item.ticketId));
      if (result.failed.length === 0) {
        setBulkReason('');
        setBulkPendingUntil('');
      }
      if (isAgent) {
        getDashboard().then((dashboard) => setStats(dashboard as DashboardStats)).catch(() => {});
      }
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Toplu işlem tamamlanamadı');
    } finally {
      setBulkLoading(false);
    }
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

  const bulkStatusOptions = [
    { value: 'open', label: 'Açık' },
    { value: 'pending', label: 'Beklemede' },
    { value: 'resolved', label: 'Çözüldü' },
    ...(userRole === 'admin' ? [{ value: 'closed', label: 'Kapalı' }] : []),
  ];

  const bulkOperationOptions = [
    { value: '', label: 'Toplu işlem seçin' },
    { value: 'status', label: 'Durum değiştir' },
    { value: 'priority', label: 'Öncelik değiştir' },
    { value: 'assign', label: userRole === 'admin' ? 'Ajan ata' : 'Kendime ata' },
  ];

  const bulkAgentOptions = [
    { value: '', label: 'Ajan seçin' },
    { value: 'unassigned', label: 'Atamayı kaldır' },
    ...agentOptions.filter((option) => option.value),
  ];

  const queueOptions: Array<{ value: TicketQueue | ''; label: string; count?: number }> = [
    { value: '', label: 'Tüm Ticketlar' },
    ...(userRole === 'agent'
      ? [{ value: 'my' as const, label: 'My Tickets', count: stats?.queueCounts.myTickets }]
      : []),
    { value: 'unassigned', label: 'Unassigned & Open', count: stats?.queueCounts.unassignedOpen },
    { value: 'escalated', label: 'Escalated', count: stats?.queueCounts.escalated },
  ];

  const allCurrentPageSelected = tickets.length > 0
    && tickets.every((ticket) => selectedTicketIds.includes(ticket.id));

  const bulkOperationSummary = bulkOperation === 'status'
    ? `Durum: ${statusLabels[bulkStatus]}`
    : bulkOperation === 'priority'
      ? `Öncelik: ${priorityOptions.find((option) => option.value === bulkPriority)?.label}`
      : userRole === 'agent'
        ? 'Atama: Kendime ata'
        : `Atama: ${bulkAgentOptions.find((option) => option.value === bulkAgentId)?.label || '-'}`;

  return (
    <div>
      {isAgent && stats && (
        <div className={styles.dashboardGrid}>
          <Card title={`Aktif Durum Dağılımı (${stats.activeTotal})`}>
            {(['new', 'open', 'pending'] as const).map((k) => (
              <div key={k} className={styles.statRow}>
                <span>{statusLabels[k]}</span>
                <strong>{stats.statusBreakdown[k] || 0}</strong>
              </div>
            ))}
          </Card>
          <Card title="Aktif Ticket Öncelikleri">
            {(['urgent', 'high', 'normal', 'low'] as const).map((k) => (
              <div key={k} className={styles.statRow}>
                <PriorityBadge priority={k} />
                <strong>{stats.priorityBreakdown[k] || 0}</strong>
              </div>
            ))}
          </Card>
          <Card title="Aktif SLA İhlalleri">
            <p className={styles.slaCount} style={{ color: stats.slaBreached > 0 ? 'var(--danger)' : 'var(--success)' }}>
              {stats.slaBreached}
            </p>
            {stats.slaBreached > 0 && <p className={styles.slaText}>Ticket SLA süresini aştı</p>}
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
        <nav className={styles.queueBar} aria-label="Ticket kuyrukları">
          {queueOptions.map((option) => (
            <Button
              key={option.value || 'all'}
              size="sm"
              variant={queueFilter === option.value ? 'primary' : 'secondary'}
              onClick={() => handleQueueChange(option.value)}
              aria-pressed={queueFilter === option.value}
            >
              {option.label}{option.count !== undefined ? ` (${option.count})` : ''}
            </Button>
          ))}
        </nav>
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
            <Select value={agentFilter} onChange={(e) => handleAgentFilterChange(e.target.value)} options={agentOptions} />
          </div>
          <div className={styles.searchGroup}>
            <div className={styles.searchInput}>
              <Input placeholder="Ara..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            </div>
            <Button variant="secondary" size="sm" onClick={handleSearch}>Ara</Button>
          </div>
        </div>
      )}

      {isAgent && selectedTicketIds.length > 0 && (
        <Card className={styles.bulkCard}>
          <div className={styles.bulkHeader}>
            <strong>{selectedTicketIds.length} ticket seçildi</strong>
            <Button size="sm" variant="ghost" onClick={() => setSelectedTicketIds([])}>Seçimi Temizle</Button>
          </div>
          <div className={styles.bulkControls}>
            <div className={styles.bulkControl}>
              <Select value={bulkOperation} onChange={(e) => { setBulkOperation(e.target.value); setBulkError(''); }} options={bulkOperationOptions} />
            </div>
            {bulkOperation === 'status' && (
              <>
                <div className={styles.bulkControl}>
                  <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as Exclude<Status, 'new'>)} options={bulkStatusOptions} />
                </div>
                {bulkStatus === 'pending' && (
                  <div className={styles.bulkControlWide}>
                    <Input type="datetime-local" value={bulkPendingUntil} onChange={(e) => setBulkPendingUntil(e.target.value)} aria-label="Pending bitiş tarihi" />
                  </div>
                )}
                {(bulkStatus === 'pending' || bulkStatus === 'open') && (
                  <div className={styles.bulkControlWide}>
                    <Input value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="İşlem nedeni" />
                  </div>
                )}
              </>
            )}
            {bulkOperation === 'priority' && (
              <div className={styles.bulkControl}>
                <Select value={bulkPriority} onChange={(e) => setBulkPriority(e.target.value as Priority)} options={priorityOptions.filter((option) => option.value)} />
              </div>
            )}
            {bulkOperation === 'assign' && userRole === 'admin' && (
              <div className={styles.bulkControlWide}>
                <Select value={bulkAgentId} onChange={(e) => setBulkAgentId(e.target.value)} options={bulkAgentOptions} />
              </div>
            )}
            <Button size="sm" onClick={prepareBulkOperation} disabled={!bulkOperation}>Uygula</Button>
          </div>
          {bulkError && <p className={styles.errorText}>{bulkError}</p>}
        </Card>
      )}

      {bulkResult && (
        <div className={styles.bulkResult} role="status">
          <strong>{bulkResult.succeeded.length} başarılı, {bulkResult.failed.length} başarısız.</strong>
          {bulkResult.failed.length > 0 && (
            <ul>
              {bulkResult.failed.map((item) => (
                <li key={item.ticketId}>{item.displayId}: {item.reason}</li>
              ))}
            </ul>
          )}
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
                {isAgent && (
                  <th className={styles.checkboxCell}>
                    <input
                      type="checkbox"
                      checked={allCurrentPageSelected}
                      onChange={toggleCurrentPageSelection}
                      aria-label="Bu sayfadaki ticketları seç"
                    />
                  </th>
                )}
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
                  {isAgent && (
                    <td className={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        checked={selectedTicketIds.includes(t.id)}
                        onChange={() => toggleTicketSelection(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        aria-label={`${t.displayId} ticketını seç`}
                      />
                    </td>
                  )}
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

      <Modal open={showBulkConfirm} onClose={() => setShowBulkConfirm(false)} title="Toplu İşlemi Onayla">
        <p className={styles.bulkConfirmText}>
          <strong>{selectedTicketIds.length} ticket</strong> güncellenecek.
        </p>
        <p className={styles.bulkConfirmText}>{bulkOperationSummary}</p>
        <p className={styles.bulkConfirmNote}>Uygun olmayan ticketlar değiştirilmez ve sonuç ekranında nedenleri gösterilir.</p>
        <div className={styles.bulkConfirmActions}>
          <Button variant="secondary" onClick={() => setShowBulkConfirm(false)}>Vazgeç</Button>
          <Button onClick={executeBulkOperation} loading={bulkLoading}>Onayla</Button>
        </div>
        {bulkError && <p className={styles.errorText}>{bulkError}</p>}
      </Modal>

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
