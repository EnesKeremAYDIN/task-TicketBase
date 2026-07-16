import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listTickets, createTicket, claimTicket } from '../lib/api';

interface Ticket {
  id: string;
  displayId: string;
  title: string;
  status: string;
  priority: string;
  customer: { name: string };
  assignedTo: { name: string } | null;
  createdAt: string;
}

function TicketList() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrio, setNewPrio] = useState('normal');
  const [error, setError] = useState('');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  async function load() {
    const params: Record<string, string> = { page: String(page), limit: '20' };
    if (filter) params.status = filter;
    if (search) params.search = search;
    const data = await listTickets(params);
    setTickets(data.tickets);
    setTotal(data.total);
  }

  useEffect(() => { load(); }, [page, filter, search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createTicket({ title: newTitle, description: newDesc, priority: newPrio });
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

  const statusColors: Record<string, string> = {
    new: '#3498db', open: '#2ecc71', pending: '#f39c12', resolved: '#95a5a6', closed: '#7f8c8d',
  };

  return (
    <div>
      <h2>Ticket Listesi</h2>

      {user.role === 'customer' && (
        <button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'İptal' : 'Yeni Ticket'}
        </button>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} style={{ margin: '8px 0', padding: 8, border: '1px solid #ccc' }}>
          <input placeholder="Başlık" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
          <br />
          <textarea placeholder="Açıklama" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} required />
          <br />
          <select value={newPrio} onChange={(e) => setNewPrio(e.target.value)}>
            <option value="low">Düşük</option>
            <option value="normal">Normal</option>
            <option value="high">Yüksek</option>
            <option value="urgent">Acil</option>
          </select>
          <button type="submit">Oluştur</button>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </form>
      )}

      <div style={{ margin: '8px 0' }}>
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
          <option value="">Tümü</option>
          <option value="new">Yeni</option>
          <option value="open">Açık</option>
          <option value="pending">Beklemede</option>
          <option value="resolved">Çözüldü</option>
          <option value="closed">Kapalı</option>
        </select>
        <input placeholder="Ara..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ marginLeft: 8 }} />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th>No</th><th>Başlık</th><th>Durum</th><th>Öncelik</th><th>Müşteri</th><th>Ajan</th><th>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{t.displayId}</td>
              <td><Link to={`/tickets/${t.id}`}>{t.title}</Link></td>
              <td><span style={{ color: statusColors[t.status] || '#000' }}>{t.status}</span></td>
              <td>{t.priority}</td>
              <td>{t.customer?.name}</td>
              <td>{t.assignedTo?.name || '-'}</td>
              <td>
                {user.role === 'agent' && !t.assignedTo && (
                  <button onClick={() => handleClaim(t.id)}>Üstlen</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 8 }}>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Önceki</button>
        <span style={{ margin: '0 8px' }}>Sayfa {page} / {Math.ceil(total / 20)}</span>
        <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)}>Sonraki</button>
      </div>
    </div>
  );
}

export default TicketList;
