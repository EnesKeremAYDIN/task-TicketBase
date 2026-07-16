import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTicket, updateTicketStatus, claimTicket, assignTicket, getComments, createComment } from '../lib/api';
import { getAgents } from '../lib/api';
import type { Ticket as TicketType, Comment, Agent } from '../lib/types';
import Card from '../components/Card/Card';
import StatusBadge from '../components/StatusBadge/StatusBadge';
import PriorityBadge from '../components/PriorityBadge/PriorityBadge';
import Button from '../components/Button/Button';
import Textarea from '../components/Textarea/Textarea';
import Select from '../components/Select/Select';
import Modal from '../components/Modal/Modal';
import Loading from '../components/Loading/Loading';

function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketType | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState('public_reply');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAgent = user.role === 'agent' || user.role === 'admin';

  async function load() {
    if (!id) return;
    const [t, c] = await Promise.all([getTicket(id), getComments(id)]);
    setTicket(t);
    setComments(c);
  }

  useEffect(() => {
    load();
    if (user.role === 'admin') getAgents().then(setAgents);
  }, [id]);

  if (!ticket) return <Loading />;

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

  async function handleAssign() {
    if (!id || !selectedAgent) return;
    await assignTicket(id, selectedAgent);
    setShowAssign(false);
    load();
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !newComment) return;
    await createComment(id, commentType, newComment);
    setNewComment('');
    load();
  }

  const statusActions: Record<string, string[]> = {
    new: ['open'],
    open: ['pending', 'resolved'],
    pending: ['open'],
    resolved: ['closed'],
  };

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/tickets')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-secondary)', padding: 0, lineHeight: 1, marginRight: 8 }} title="Geri">&larr;</button>
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{ticket.displayId}: {ticket.title}</h2>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          {ticket.slaBreached && <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.85rem' }}>SLA İhlali</span>}
        </div>

        <div style={{ display: 'flex', gap: 16, color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 12 }}>
          <span>Müşteri: <strong>{ticket.customer?.name}</strong></span>
          <span>Ajan: <strong>{ticket.assignedTo?.name || 'Atanmamış'}</strong></span>
          <span>Oluşturma: <strong>{new Date(ticket.createdAt).toLocaleDateString('tr-TR')}</strong></span>
        </div>

        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ticket.description}</p>
      </Card>

      {isAgent && (
        <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
          {statusActions[ticket.status]?.map((s) => (
            <Button key={s} size="sm" onClick={() => handleStatus(s)}>
              {s === 'open' ? 'Aç' : s === 'pending' ? 'Beklemeye Al' : s === 'resolved' ? 'Çözüldü' : s === 'closed' ? 'Kapat' : s}
            </Button>
          ))}
          {!ticket.assignedTo && user.role === 'agent' && (
            <Button variant="secondary" size="sm" onClick={handleClaim}>Üstlen</Button>
          )}
          {user.role === 'admin' && (
            <Button variant="secondary" size="sm" onClick={() => setShowAssign(true)}>
              {ticket.assignedTo ? 'Ajan Değiştir' : 'Ajan Ata'}
            </Button>
          )}
        </div>
      )}

      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="Ajan Ata">
        <Select label="Ajan Seç" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)} options={agents.map((a) => ({ value: a.id, label: a.name }))} />
        <Button onClick={handleAssign} disabled={!selectedAgent} style={{ marginTop: 8 }}>Ata</Button>
      </Modal>

      <Card title="Yorumlar" style={{ marginTop: 16 }}>
        {comments.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Henüz yorum yok.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ fontSize: '0.85rem' }}>{c.author?.name}</strong>
                {c.type === 'internal_note' && <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>İç Not</span>}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(c.createdAt).toLocaleString('tr-TR')}</span>
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{c.body}</p>
            </div>
          ))
        )}

        <form onSubmit={handleComment} style={{ marginTop: 16 }}>
          <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Yorumunuz..." required />
          {isAgent && (
            <Select value={commentType} onChange={(e) => setCommentType(e.target.value)} options={[
              { value: 'public_reply', label: 'Genel Yanıt' },
              { value: 'internal_note', label: 'İç Not' },
            ]} />
          )}
          <Button type="submit" style={{ marginTop: 4 }}>Gönder</Button>
        </form>
      </Card>
    </div>
  );
}

export default TicketDetail;
