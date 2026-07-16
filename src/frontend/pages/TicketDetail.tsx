import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTicket, updateTicketStatus, claimTicket, getComments, createComment } from '../lib/api';

function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Record<string, unknown> | null>(null);
  const [comments, setComments] = useState<Record<string, unknown>[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState('public_reply');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  async function load() {
    if (!id) return;
    const t = await getTicket(id);
    setTicket(t);
    const c = await getComments(id);
    setComments(c);
  }

  useEffect(() => { load(); }, [id]);

  if (!ticket) return <div>Yükleniyor...</div>;

  async function handleStatus(newStatus: string) {
    if (!id) return;
    await updateTicketStatus(id, newStatus);
    load();
  }

  async function handleClaim() {
    if (!id) return;
    await claimTicket(id);
    load();
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !newComment) return;
    await createComment(id, commentType, newComment);
    setNewComment('');
    load();
  }

  const isAgent = user.role === 'agent' || user.role === 'admin';

  return (
    <div>
      <button onClick={() => navigate('/tickets')}>← Geri</button>

      <h2>{ticket.displayId}: {ticket.title}</h2>

      <div style={{ display: 'flex', gap: 16, margin: '8px 0' }}>
        <span>Durum: <strong>{ticket.status}</strong></span>
        <span>Öncelik: <strong>{ticket.priority}</strong></span>
        <span>Müşteri: <strong>{ticket.customer?.name}</strong></span>
        <span>Ajan: <strong>{ticket.assignedTo?.name || 'Atanmamış'}</strong></span>
      </div>

      <p>{ticket.description}</p>

      {isAgent && (
        <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
          {ticket.status === 'new' && <button onClick={() => handleStatus('open')}>Aç</button>}
          {ticket.status === 'open' && <button onClick={() => handleStatus('pending')}>Beklemeye Al</button>}
          {ticket.status === 'open' && <button onClick={() => handleStatus('resolved')}>Çözüldü</button>}
          {ticket.status === 'pending' && <button onClick={() => handleStatus('open')}>Tekrar Aç</button>}
          {ticket.status === 'resolved' && <button onClick={() => handleStatus('closed')}>Kapat</button>}
          {!ticket.assignedTo && user.role === 'agent' && (
            <button onClick={handleClaim}>Üstlen</button>
          )}
        </div>
      )}

      <hr />

      <h3>Yorumlar</h3>
      {comments.map((c) => (
        <div key={c.id} style={{ margin: '4px 0', padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
          <small><strong>{c.author?.name}</strong> ({c.type === 'internal_note' ? 'İç Not' : 'Genel'})</small>
          <p style={{ margin: '4px 0' }}>{c.body}</p>
        </div>
      ))}

      <form onSubmit={handleComment} style={{ marginTop: 16 }}>
        <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Yorumunuz..." required style={{ width: '100%' }} />
        <br />
        {isAgent && (
          <select value={commentType} onChange={(e) => setCommentType(e.target.value)} style={{ margin: '4px 0' }}>
            <option value="public_reply">Genel Yanıt</option>
            <option value="internal_note">İç Not</option>
          </select>
        )}
        <button type="submit">Gönder</button>
      </form>
    </div>
  );
}

export default TicketDetail;
