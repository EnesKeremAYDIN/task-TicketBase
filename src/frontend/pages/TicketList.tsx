import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  listTickets,
  createTicket,
  bulkUpdateTickets,
  claimTicket,
  getAgents,
  getTicketCategories,
} from '../lib/api';
import type {
  Ticket,
  Priority,
  Status,
  Agent,
  BulkTicketOperation,
  BulkTicketResult,
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
import ErrorBanner from '../components/ErrorBanner/ErrorBanner';
import { getStoredUser } from '../lib/auth-user';
import { parseIstanbulDateTimeInput } from '../lib/date';
import styles from './TicketList.module.css';

const VALID_QUEUES: TicketQueue[] = ['my', 'unassigned', 'escalated'];
const VALID_STATUSES: Status[] = ['new', 'open', 'pending', 'resolved', 'closed'];
const VALID_PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

function parsePositiveInteger(value: string | null, fallback: number, maximum?: number) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return maximum ? Math.min(parsed, maximum) : parsed;
}

function TicketList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = getStoredUser();
  const userRole = user?.role;
  const isAgent = userRole === 'agent' || userRole === 'admin';
  const canViewTickets = userRole === 'customer' || isAgent;
  const requestedQueue = searchParams.get('queue');
  const queueFilter = (
    requestedQueue
    && VALID_QUEUES.includes(requestedQueue as TicketQueue)
    && !(requestedQueue === 'my' && userRole !== 'agent')
  ) ? requestedQueue as TicketQueue : '';
  const requestedStatus = searchParams.get('status');
  const statusFilter = requestedStatus && VALID_STATUSES.includes(requestedStatus as Status)
    ? requestedStatus
    : '';
  const requestedPriority = searchParams.get('priority');
  const priorityFilter = requestedPriority && VALID_PRIORITIES.includes(requestedPriority as Priority)
    ? requestedPriority
    : '';
  const categoryFilter = searchParams.get('category') || '';
  const agentFilter = searchParams.get('agent') || '';
  const search = searchParams.get('q') || '';
  const page = parsePositiveInteger(searchParams.get('page'), 1);
  const limit = parsePositiveInteger(searchParams.get('limit'), 20, 100);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState(search);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrio, setNewPrio] = useState('normal');
  const [createError, setCreateError] = useState('');
  const [listError, setListError] = useState('');
  const [agentError, setAgentError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [agentOptions, setAgentOptions] = useState<{ value: string; label: string }[]>([
    { value: '', label: 'Tüm Ajanlar' },
  ]);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([
    { value: '', label: 'Tüm Kategoriler' },
  ]);
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

  const updateUrl = useCallback((
    updates: Record<string, string | null>,
    replace = false,
  ) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setSearchParams(next, { replace });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    if (!canViewTickets) return;
    setLoading(true);
    setListError('');
    try {
      const params: Record<string, string> = { page: String(page), limit: String(limit) };
      if (queueFilter) params.queue = queueFilter;
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (agentFilter) params.assignedToId = agentFilter;
      if (search) params.search = search;
      const data = await listTickets(params);
      setTickets(data.tickets);
      setTotal(data.total);
    } catch (loadError) {
      setTickets([]);
      setTotal(0);
      setListError(loadError instanceof Error ? loadError.message : 'Ticketlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    queueFilter,
    statusFilter,
    priorityFilter,
    categoryFilter,
    agentFilter,
    search,
    canViewTickets,
  ]);

  const loadFilterOptions = useCallback(async () => {
    if (!isAgent) return;
    const [agentsResult, categoriesResult] = await Promise.allSettled([
      getAgents(),
      getTicketCategories(),
    ]);

    if (agentsResult.status === 'fulfilled') {
      const agentList = agentsResult.value as Agent[];
      setAgentError('');
      setAgentOptions([
        { value: '', label: 'Tüm Ajanlar' },
        ...agentList.map((agent) => ({ value: agent.id, label: agent.name })),
      ]);
    } else {
      setAgentOptions([{ value: '', label: 'Tüm Ajanlar' }]);
      setAgentError(
        agentsResult.reason instanceof Error
          ? agentsResult.reason.message
          : 'Ajan listesi yüklenemedi',
      );
    }

    if (categoriesResult.status === 'fulfilled') {
      setCategoryError('');
      setCategoryOptions([
        { value: '', label: 'Tüm Kategoriler' },
        ...categoriesResult.value.map((category) => ({ value: category, label: category })),
      ]);
    } else {
      setCategoryOptions([{ value: '', label: 'Tüm Kategoriler' }]);
      setCategoryError(
        categoriesResult.reason instanceof Error
          ? categoriesResult.reason.message
          : 'Kategori listesi yüklenemedi',
      );
    }
  }, [isAgent]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    if (
      userRole === 'agent'
      && !searchParams.has('queue')
      && [...searchParams.keys()].length === 0
    ) {
      updateUrl({ queue: 'my' }, true);
    }
  }, [searchParams, updateUrl, userRole]);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    if (searchInput.trim() === search) return undefined;
    const timeoutId = window.setTimeout(() => {
      updateUrl({ q: searchInput.trim() || null, page: null }, true);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [search, searchInput, updateUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedTicketIds([]);
    setBulkResult(null);
  }, [
    page,
    limit,
    queueFilter,
    statusFilter,
    priorityFilter,
    categoryFilter,
    agentFilter,
    search,
  ]);

  function handleSearch() {
    updateUrl({ q: searchInput.trim() || null, page: null });
  }

  function handleFilterChange(key: string, value: string) {
    updateUrl({ [key]: value || null, page: null });
  }

  function handleQueueChange(queue: TicketQueue | '') {
    updateUrl({
      queue: queue || null,
      agent: queue === 'my' || queue === 'unassigned' ? null : agentFilter || null,
      page: null,
    });
  }

  function handleAgentFilterChange(agentId: string) {
    updateUrl({
      agent: agentId || null,
      queue: queueFilter === 'my' || queueFilter === 'unassigned' ? null : queueFilter || null,
      page: null,
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    try {
      const createdTicket = await createTicket({ title: newTitle, description: newDesc, priority: newPrio as Priority });
      setShowCreate(false);
      setNewTitle('');
      setNewDesc('');
      setNewPrio('normal');
      navigate(`/tickets/${createdTicket.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Ticket oluşturulamadı');
    }
  }

  async function handleClaim(id: string) {
    setListError('');
    try {
      await claimTicket(id);
      await load();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Ticket üstlenilemedi');
    }
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
        const pendingDate = parseIstanbulDateTimeInput(bulkPendingUntil);
        if (!pendingDate || pendingDate <= new Date()) {
          setBulkError('Pending bitiş tarihi İstanbul saatine göre gelecekte olmalıdır.');
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

    let pendingUntilIso: string | undefined;
    if (bulkOperation === 'status' && bulkStatus === 'pending') {
      const pendingDate = parseIstanbulDateTimeInput(bulkPendingUntil);
      if (!pendingDate || pendingDate <= new Date()) {
        setBulkError('Pending bitiş tarihi İstanbul saatine göre gelecekte olmalıdır.');
        return;
      }
      pendingUntilIso = pendingDate.toISOString();
    }

    setBulkLoading(true);
    setBulkError('');
    try {
      let operation: BulkTicketOperation;
      if (bulkOperation === 'status') {
        operation = {
          type: 'status',
          status: bulkStatus,
          pendingUntil: pendingUntilIso,
          reason: bulkReason.trim() || undefined,
        };
      } else if (bulkOperation === 'priority') {
        operation = { type: 'priority', priority: bulkPriority };
      } else {
        operation = {
          type: 'assign',
          agentId: userRole === 'agent'
            ? user?.id || null
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
      ? [{ value: 'my' as const, label: 'Ticketlarım' }]
      : []),
    { value: 'unassigned', label: 'Atanmamış ve Açık' },
    { value: 'escalated', label: 'Eskalasyondakiler' },
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
      <div className={styles.headerRow}>
        <h2 className={styles.headerTitle}>Ticket Listesi</h2>
        {userRole === 'customer' && (
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
            {createError && <ErrorBanner message={createError} />}
            <Button type="submit" className={styles.formSubmit}>Oluştur</Button>
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
        <>
          {agentError && (
            <ErrorBanner
              message={`Ajan filtresi yüklenemedi: ${agentError}`}
              onRetry={() => void loadFilterOptions()}
            />
          )}
          {categoryError && (
            <ErrorBanner
              message={`Kategori filtresi yüklenemedi: ${categoryError}`}
              onRetry={() => void loadFilterOptions()}
            />
          )}
        </>
      )}

      {isAgent && (
        <div className={styles.filterRow}>
          <div className={styles.filterSelect}>
            <Select aria-label="Durum filtresi" value={statusFilter} onChange={(e) => handleFilterChange('status', e.target.value)} options={statusOptions} />
          </div>
          <div className={styles.filterSelect}>
            <Select aria-label="Öncelik filtresi" value={priorityFilter} onChange={(e) => handleFilterChange('priority', e.target.value)} options={priorityOptions} />
          </div>
          <div className={styles.filterSelectWide}>
            <Select aria-label="Kategori filtresi" value={categoryFilter} onChange={(e) => handleFilterChange('category', e.target.value)} options={categoryOptions} />
          </div>
          <div className={styles.filterSelectWide}>
            <Select aria-label="Ajan filtresi" value={agentFilter} onChange={(e) => handleAgentFilterChange(e.target.value)} options={agentOptions} />
          </div>
          <div className={styles.searchGroup}>
            <div className={styles.searchInput}>
              <Input
                aria-label="Ticket ara"
                placeholder="Ara..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
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

      {listError && <ErrorBanner message={listError} onRetry={() => void load()} />}

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onChange={(nextPage) => updateUrl({ page: nextPage === 1 ? null : String(nextPage) })}
        onLimitChange={(nextLimit) => updateUrl({ limit: nextLimit === 20 ? null : String(nextLimit), page: null })}
      />

      {loading ? <Loading /> : tickets.length === 0 ? (
        <EmptyState
          title="Ticket bulunamadı"
          description={isAgent ? 'Filtreleri değiştirmeyi deneyin.' : 'Yeni bir ticket oluşturarak başlayabilirsiniz.'}
        />
      ) : (
        <Card>
          <div className={styles.tableScroll}>
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
                <th>No</th>
                <th>Başlık</th>
                <th>Durum</th>
                <th>Öncelik</th>
                <th className={styles.hideTablet}>Müşteri</th>
                <th className={styles.hideMobile}>Ajan</th>
                <th className={styles.hideTablet}>Son Yorum</th>
                <th></th>
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
                  <td className={styles.hideTablet}>{t.customer?.name}</td>
                  <td className={styles.hideMobile}>{t.assignedTo?.name || '-'}</td>
                  <td className={`${styles.cellLastComment} ${styles.hideTablet}`}>
                    {t.lastComment ? `${t.lastComment.author.name}: ${t.lastComment.body}` : '-'}
                  </td>
                  <td>
                    {userRole === 'agent' && !t.assignedTo && t.status !== 'closed' && (
                      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); handleClaim(t.id); }}>Üstlen</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </Card>
      )}

      <Pagination
        page={page}
        total={total}
        limit={limit}
        onChange={(nextPage) => updateUrl({ page: nextPage === 1 ? null : String(nextPage) })}
        onLimitChange={(nextLimit) => updateUrl({ limit: nextLimit === 20 ? null : String(nextLimit), page: null })}
      />

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

    </div>
  );
}

export default TicketList;
