import { useState, useEffect, useCallback } from 'react';
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
import styles from './TicketDetail.module.css';

function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketType | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState('public_reply');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  let user = {};
  try {
    const raw = localStorage.getItem('user');
    if (raw) user = JSON.parse(raw);
  } catch {
    user = {};
  }
  const isAgent = (user as { role?: string }).role === 'agent' || (user as { role?: string }).role === 'admin';
  const isAdmin = (user as { role?: string }).role === 'admin';

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const [t, c] = await Promise.all([getTicket(id), getComments(id)]);
      setTicket(t);
      setComments(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ticket yüklenirken hata oluştu');
      setTicket(null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isAdmin) {
      setAgentsLoading(true);
      getAgents().then(setAgents).catch(() => {}).finally(() => setAgentsLoading(false));
    }
  }, [isAdmin]);

  if (error) {
    return (
      <div>
        <Card>
          <div className={styles.errorCard}>
            <p className={styles.errorMsg}>{error}</p>
            <Button onClick={() => navigate('/tickets')}>&larr; Ticket Listesine Dön</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!ticket) return <Loading />;

  async function handleStatus(newStatus: string) {
    if (!id) return;
    setActionError('');
    try {
      await updateTicketStatus(id, newStatus);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'İşlem başarısız');
    }
  }

  async function handleClaim() {
    if (!id) return;
    setActionError('');
    try {
      await claimTicket(id);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Üstlenme başarısız');
    }
  }

  async function handleAssign() {
    if (!id || !selectedAgent) return;
    setActionError('');
    try {
      await assignTicket(id, selectedAgent);
      setShowAssign(false);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Atama başarısız');
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !newComment) return;
    setActionError('');
    try {
      await createComment(id, commentType, newComment);
      setNewComment('');
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Yorum gönderilemedi');
    }
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
        <div className={styles.ticketHeader}>
          <button onClick={() => navigate('/tickets')} className={styles.backBtn} title="Geri" aria-label="Geri">&larr;</button>
          <h2 className={styles.ticketTitle}>{ticket.displayId}: {ticket.title}</h2>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          {ticket.slaBreached && <span className={styles.slaBadge}>SLA İhlali</span>}
        </div>

        <div className={styles.ticketMeta}>
          <span>Müşteri: <strong>{ticket.customer?.name}</strong></span>
          <span>Ajan: <strong>{ticket.assignedTo?.name || 'Atanmamış'}</strong></span>
          <span>Oluşturma: <strong>{new Date(ticket.createdAt).toLocaleDateString('tr-TR')}</strong></span>
        </div>

        <p className={styles.ticketDesc}>{ticket.description}</p>
      </Card>

      {isAgent && (
        <div className={styles.actionBar}>
          {statusActions[ticket.status]?.map((s) => (
            <Button key={s} size="sm" onClick={() => handleStatus(s)}>
              {s === 'open' ? 'Aç' : s === 'pending' ? 'Beklemeye Al' : s === 'resolved' ? 'Çözüldü' : s === 'closed' ? 'Kapat' : s}
            </Button>
          ))}
          {!ticket.assignedTo && (user as { role?: string }).role === 'agent' && (
            <Button variant="secondary" size="sm" onClick={handleClaim}>Üstlen</Button>
          )}
          {isAdmin && (
            <Button variant="secondary" size="sm" onClick={() => setShowAssign(true)}>
              {ticket.assignedTo ? 'Ajan Değiştir' : 'Ajan Ata'}
            </Button>
          )}
          {actionError && <span className={styles.actionError}>{actionError}</span>}
        </div>
      )}

      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="Ajan Ata">
        {agentsLoading ? (
          <p className={styles.assignLoading}>Ajanlar yükleniyor...</p>
        ) : (
          <>
            <Select label="Ajan Seç" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)} options={agents.map((a) => ({ value: a.id, label: a.name }))} />
            <Button onClick={handleAssign} disabled={!selectedAgent} style={{ marginTop: 8 }}>Ata</Button>
          </>
        )}
      </Modal>

      <Card title="Yorumlar" style={{ marginTop: 16 }}>
        {comments.length === 0 ? (
          <p className={styles.commentEmpty}>Henüz yorum yok.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className={styles.commentItem}>
              <div className={styles.commentHeader}>
                <strong className={styles.commentAuthor}>{c.author?.name}</strong>
                {c.type === 'internal_note' && <span className={styles.commentBadge}>İç Not</span>}
                <span className={styles.commentDate}>{new Date(c.createdAt).toLocaleString('tr-TR')}</span>
              </div>
              <p className={styles.commentBody}>{c.body}</p>
            </div>
          ))
        )}

        <form onSubmit={handleComment} className={styles.commentForm}>
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
