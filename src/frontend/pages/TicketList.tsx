import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTickets, createTicket, claimTicket } from '../lib/api';
import type { Ticket, Status, Priority } from '../lib/types';
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

function TicketList() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrio, setNewPrio] = useState('normal');
  const [error, setError] = useState('');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const isAgent = user.role === 'agent' || user.role === 'admin';

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const data = await listTickets(params);
      setTickets(data.tickets);
      setTotal(data.total);
    } catch (err) {
      if (err instanceof Error && err.message.includes('yetkiniz')) {
        navigate('/tickets');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, statusFilter]);

  function handleSearch() {
    setPage(1);
    load();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hata');
    }
  }

  async function handleClaim(id: string) {
    await claimTicket(id);
    load();
  }

  const statusOptions = [
    { value: '', label: 'Tümü' },
    { value: 'new', label: 'Yeni' },
    { value: 'open', label: 'Açık' },
    { value: 'pending', label: 'Beklemede' },
    { value: 'resolved', label: 'Çözüldü' },
    { value: 'closed', label: 'Kapalı' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.3rem' }}>Ticket Listesi</h2>
        {user.role === 'customer' && (
          <Button onClick={() => setShowCreate(!showCreate)} variant={showCreate ? 'secondary' : 'primary'}>
            {showCreate ? 'İptal' : 'Yeni Ticket'}
          </Button>
        )}
      </div>

      {showCreate && (
        <Card>
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
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'end' }}>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} options={statusOptions} />
          <div style={{ display: 'flex', gap: 4, alignItems: 'end' }}>
            <Input placeholder="Ara..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            <Button variant="secondary" size="sm" onClick={handleSearch}>Ara</Button>
          </div>
        </div>
      )}

      {loading ? <Loading /> : tickets.length === 0 ? (
        <EmptyState title="Ticket bulunamadı" description="Filtreleri değiştirmeyi deneyin." />
      ) : isAgent ? (
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
          <Pagination page={page} total={total} limit={20} onChange={setPage} />
        </Card>
      ) : (
        <Card>
          <p>Müşteri olarak ticket listesini görüntüleyemezsiniz.</p>
        </Card>
      )}
    </div>
  );
}

export default TicketList;
