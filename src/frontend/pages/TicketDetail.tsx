import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getTicket,
  updateTicketStatus,
  confirmResolution,
  rejectResolution,
  createFollowUp,
  claimTicket,
  assignTicket,
  getComments,
  getTicketActivities,
  createComment,
  getCannedResponses,
  getTicketMacros,
  applyTicketMacro,
} from '../lib/api';
import { getAgents } from '../lib/api';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Ticket as TicketType,
  type TicketActivity,
  type Comment,
  type Agent,
  type Priority,
  type Status,
  type CannedResponse,
  type TicketMacro,
} from '../lib/types';
import Card from '../components/Card/Card';
import StatusBadge from '../components/StatusBadge/StatusBadge';
import PriorityBadge from '../components/PriorityBadge/PriorityBadge';
import Button from '../components/Button/Button';
import Textarea from '../components/Textarea/Textarea';
import Input from '../components/Input/Input';
import Select from '../components/Select/Select';
import Modal from '../components/Modal/Modal';
import Loading from '../components/Loading/Loading';
import ErrorBanner from '../components/ErrorBanner/ErrorBanner';
import { getStoredUser } from '../lib/auth-user';
import { macroActionLabel, renderCannedTemplate } from '../lib/automation';
import {
  formatIstanbulDate,
  formatIstanbulDateTime,
  parseIstanbulDateTimeInput,
} from '../lib/date';
import styles from './TicketDetail.module.css';

function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketType | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<TicketActivity[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityLoading, setActivityLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState('public_reply');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [pendingUntil, setPendingUntil] = useState('');
  const [pendingReason, setPendingReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [resolutionReason, setResolutionReason] = useState('');
  const [followUpDescription, setFollowUpDescription] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [agentLoadError, setAgentLoadError] = useState('');
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [macros, setMacros] = useState<TicketMacro[]>([]);
  const [selectedMacroId, setSelectedMacroId] = useState('');
  const [showMacroConfirm, setShowMacroConfirm] = useState(false);
  const [macroLoading, setMacroLoading] = useState(false);
  const [automationError, setAutomationError] = useState('');

  const user = getStoredUser();
  const isAgent = user?.role === 'agent' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';
  const isCustomer = user?.role === 'customer';

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const [t, c, activityResponse] = await Promise.all([
        getTicket(id),
        getComments(id),
        getTicketActivities(id),
      ]);
      setTicket(t);
      setComments(c);
      setActivities(activityResponse.activities);
      setActivityTotal(activityResponse.total);
      setActivityPage(1);
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
      setAgentLoadError('');
      getAgents()
        .then(setAgents)
        .catch((loadError) => {
          setAgentLoadError(
            loadError instanceof Error ? loadError.message : 'Ajan listesi yüklenemedi',
          );
        })
        .finally(() => setAgentsLoading(false));
    }
  }, [isAdmin]);

  const loadAutomations = useCallback(async () => {
    if (!isAgent) return;
    setAutomationError('');
    const [responseResult, macroResult] = await Promise.allSettled([
      getCannedResponses(),
      getTicketMacros(),
    ]);
    if (responseResult.status === 'fulfilled') {
      setCannedResponses(responseResult.value);
    } else {
      setCannedResponses([]);
      setAutomationError(responseResult.reason instanceof Error
        ? responseResult.reason.message
        : 'Hazır yanıtlar yüklenemedi');
    }
    if (macroResult.status === 'fulfilled') {
      setMacros(macroResult.value);
    } else {
      setMacros([]);
      setAutomationError((current) => current || (
        macroResult.reason instanceof Error ? macroResult.reason.message : 'Makrolar yüklenemedi'
      ));
    }
  }, [isAgent]);

  useEffect(() => {
    void loadAutomations();
  }, [loadAutomations]);

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
    if (newStatus === 'pending') {
      setShowPending(true);
      return;
    }
    if (ticket?.status === 'closed' && newStatus === 'open') {
      setShowReopen(true);
      return;
    }
    try {
      await updateTicketStatus(id, newStatus);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'İşlem başarısız');
    }
  }

  async function handlePending() {
    if (!id || !pendingUntil || !pendingReason.trim()) return;
    setActionError('');
    const pendingDate = parseIstanbulDateTimeInput(pendingUntil);
    if (!pendingDate || pendingDate <= new Date()) {
      setActionError('Bekleme bitiş tarihi İstanbul saatine göre gelecekte olmalıdır.');
      return;
    }
    try {
      await updateTicketStatus(id, 'pending', {
        pendingUntil: pendingDate.toISOString(),
        pendingReason: pendingReason.trim(),
      });
      setShowPending(false);
      setPendingUntil('');
      setPendingReason('');
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Bekleme işlemi başarısız');
    }
  }

  async function handleReopen() {
    if (!id || !reopenReason.trim()) return;
    setActionError('');
    try {
      await updateTicketStatus(id, 'open', { reason: reopenReason.trim() });
      setShowReopen(false);
      setReopenReason('');
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Yeniden açma işlemi başarısız');
    }
  }

  async function handleConfirmResolution() {
    if (!id) return;
    setActionError('');
    try {
      await confirmResolution(id);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Çözüm onaylanamadı');
    }
  }

  async function handleRejectResolution() {
    if (!id || !resolutionReason.trim()) return;
    setActionError('');
    try {
      await rejectResolution(id, resolutionReason.trim());
      setResolutionReason('');
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Ticket yeniden açılamadı');
    }
  }

  async function handleFollowUp() {
    if (!id || !followUpDescription.trim()) return;
    setActionError('');
    try {
      const followUp = await createFollowUp(id, followUpDescription.trim());
      navigate(`/tickets/${followUp.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Takip ticketı oluşturulamadı');
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

  function handleCannedResponse(responseId: string) {
    const response = cannedResponses.find((item) => item.id === responseId);
    if (!response || !ticket) return;
    setCommentType(response.commentType);
    setNewComment(renderCannedTemplate(response.body, ticket, user));
  }

  async function handleApplyMacro() {
    if (!id || !selectedMacroId) return;
    setMacroLoading(true);
    setActionError('');
    try {
      await applyTicketMacro(id, selectedMacroId);
      setShowMacroConfirm(false);
      setSelectedMacroId('');
      await load();
    } catch (macroError) {
      setActionError(macroError instanceof Error ? macroError.message : 'Makro uygulanamadı');
    } finally {
      setMacroLoading(false);
    }
  }

  async function loadMoreActivities() {
    if (!id || activityLoading || activities.length >= activityTotal) return;
    setActivityLoading(true);
    try {
      const nextPage = activityPage + 1;
      const response = await getTicketActivities(id, nextPage);
      setActivities((current) => [...current, ...response.activities]);
      setActivityPage(nextPage);
      setActivityTotal(response.total);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Geçmiş yüklenemedi');
    } finally {
      setActivityLoading(false);
    }
  }

  function activityActor(activity: TicketActivity) {
    return activity.actor?.name || 'Sistem';
  }

  function activityValue(activity: TicketActivity, value: string | null, label: string | null) {
    if (label) return label;
    if (!value) return 'Atanmamış';
    if (activity.field === 'status') return STATUS_LABELS[value as Status] || value;
    if (activity.field === 'priority') return PRIORITY_LABELS[value as Priority] || value;
    return value;
  }

  function activityDescription(activity: TicketActivity) {
    const actor = activityActor(activity);
    const oldValue = activityValue(activity, activity.oldValue, activity.oldLabel);
    const newValue = activityValue(activity, activity.newValue, activity.newLabel);

    if (activity.type === 'ticket_created') return `${actor} ticket'ı oluşturdu.`;
    if (activity.type === 'status_changed') {
      return `${actor} durumu "${oldValue}" değerinden "${newValue}" değerine değiştirdi.`;
    }
    if (activity.type === 'priority_changed') {
      return `${actor} önceliği "${oldValue}" değerinden "${newValue}" değerine değiştirdi.`;
    }
    if (activity.type === 'assignee_changed') {
      return `${actor} atamayı "${oldValue}" değerinden "${newValue}" değerine değiştirdi.`;
    }
    if (activity.type === 'macro_applied') {
      return `${actor} "${activity.newLabel || 'Makro'}" makrosunu uyguladı.`;
    }
    return `${actor}, ${activity.newLabel || 'yeni'} takip ticket'ını oluşturdu.`;
  }

  function activitySourceLabel(source: TicketActivity['source']) {
    return {
      web: 'Web',
      email: 'E-posta',
      bulk: 'Toplu İşlem',
      macro: 'Makro',
      system: 'Sistem',
      seed: 'Demo Verisi',
    }[source];
  }

  const statusActions = ticket.allowedActions.filter((action) => (
    ['new', 'open', 'pending', 'resolved', 'closed'].includes(action)
  ));
  const selectedMacro = macros.find((macro) => macro.id === selectedMacroId);

  const statusActionLabel = (status: string) => {
    if (status === 'open') return ticket.status === 'closed' ? 'Yeniden Aç' : 'Aç';
    if (status === 'pending') return 'Beklemeye Al';
    if (status === 'resolved') return 'Çözüldü';
    if (status === 'closed') return 'Kapat';
    return status;
  };

  return (
    <div>
      <Card>
        <div className={styles.ticketHeader}>
          <button onClick={() => navigate('/tickets')} className={styles.backBtn} title="Geri" aria-label="Geri">&larr;</button>
          <h2 className={styles.ticketTitle}>{ticket.displayId}: {ticket.title}</h2>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          {ticket.firstResponseSlaBreached && (
            <span className={styles.slaBadge}>İlk Yanıt SLA İhlali</span>
          )}
          {ticket.resolutionSlaBreached && (
            <span className={styles.slaBadge}>Çözüm SLA İhlali</span>
          )}
          {ticket.slaBreached
            && !ticket.firstResponseSlaBreached
            && !ticket.resolutionSlaBreached
            && <span className={styles.slaBadge}>SLA İhlali</span>}
        </div>

        <div className={styles.ticketMeta}>
          <span>Müşteri: <strong>{ticket.customer?.name}</strong></span>
          <span>Ajan: <strong>{ticket.assignedTo?.name || 'Atanmamış'}</strong></span>
          <span>Oluşturma: <strong>{formatIstanbulDate(ticket.createdAt)}</strong></span>
          {ticket.pendingUntil && <span>Bekleme Sonu: <strong>{formatIstanbulDateTime(ticket.pendingUntil)}</strong></span>}
          {ticket.reopenCount > 0 && <span>Yeniden Açılma: <strong>{ticket.reopenCount}</strong></span>}
        </div>

        {ticket.pendingReason && <p className={styles.lifecycleInfo}>Bekleme nedeni: {ticket.pendingReason}</p>}
        {ticket.followUpOf && (
          <p className={styles.lifecycleInfo}>
            Takip kaydı: <button className={styles.linkButton} onClick={() => navigate(`/tickets/${ticket.followUpOf?.id}`)}>{ticket.followUpOf.displayId}</button>
          </p>
        )}

        <p className={styles.ticketDesc}>{ticket.description}</p>
      </Card>

      {isAgent && (
        <div className={styles.actionBar}>
          {statusActions.map((s) => (
            <Button key={s} size="sm" onClick={() => handleStatus(s)}>
              {statusActionLabel(s)}
            </Button>
          ))}
          {!ticket.assignedTo && user?.role === 'agent' && (
            <Button variant="secondary" size="sm" onClick={handleClaim}>Üstlen</Button>
          )}
          {isAdmin && (
            <Button variant="secondary" size="sm" onClick={() => setShowAssign(true)}>
              {ticket.assignedTo ? 'Ajan Değiştir' : 'Ajan Ata'}
            </Button>
          )}
          {macros.length > 0 && (
            <div className={styles.macroControl}>
              <Select
                aria-label="Makro seç"
                value={selectedMacroId}
                onChange={(event) => setSelectedMacroId(event.target.value)}
                options={[
                  { value: '', label: 'Makro seçin' },
                  ...macros.map((macro) => ({ value: macro.id, label: macro.name })),
                ]}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!selectedMacroId}
                onClick={() => {
                  setActionError('');
                  setShowMacroConfirm(true);
                }}
              >
                Makroyu Uygula
              </Button>
            </div>
          )}
          {actionError && <span className={styles.actionError}>{actionError}</span>}
        </div>
      )}

      {isAgent && automationError && (
        <ErrorBanner message={automationError} onRetry={() => void loadAutomations()} />
      )}

      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="Ajan Ata">
        {agentsLoading ? (
          <p className={styles.assignLoading}>Ajanlar yükleniyor...</p>
        ) : agentLoadError ? (
          <p className={styles.actionError}>{agentLoadError}</p>
        ) : (
          <>
            <Select label="Ajan Seç" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)} options={agents.map((a) => ({ value: a.id, label: a.name }))} />
            <Button onClick={handleAssign} disabled={!selectedAgent} style={{ marginTop: 8 }}>Ata</Button>
          </>
        )}
      </Modal>

      <Modal open={showPending} onClose={() => { setShowPending(false); setActionError(''); }} title="Ticket'ı Beklemeye Al">
        <Input label="Tekrar Gündeme Gelme Tarihi" type="datetime-local" value={pendingUntil} onChange={(e) => setPendingUntil(e.target.value)} />
        <Textarea label="Bekleme Nedeni" value={pendingReason} onChange={(e) => setPendingReason(e.target.value)} required />
        <Button onClick={handlePending} disabled={!pendingUntil || !pendingReason.trim()} style={{ marginTop: 8 }}>Beklemeye Al</Button>
        {actionError && <p className={styles.actionError}>{actionError}</p>}
      </Modal>

      <Modal open={showReopen} onClose={() => { setShowReopen(false); setActionError(''); }} title="Kapalı Ticket'ı Yeniden Aç">
        <Textarea label="Yeniden Açma Nedeni" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} required />
        <Button onClick={handleReopen} disabled={!reopenReason.trim()} style={{ marginTop: 8 }}>Yeniden Aç</Button>
        {actionError && <p className={styles.actionError}>{actionError}</p>}
      </Modal>

      <Modal
        open={showMacroConfirm}
        onClose={() => {
          setShowMacroConfirm(false);
          setActionError('');
        }}
        title="Makroyu Uygula"
      >
        {selectedMacro && (
          <>
            <p className={styles.macroTitle}><strong>{selectedMacro.name}</strong></p>
            {selectedMacro.description && (
              <p className={styles.lifecycleInfo}>{selectedMacro.description}</p>
            )}
            <ul className={styles.macroSummary}>
              {selectedMacro.actions.map((action) => (
                <li key={action.type}>{macroActionLabel(action)}</li>
              ))}
            </ul>
            <p className={styles.macroWarning}>
              Bütün işlemler birlikte uygulanır; bir işlem başarısız olursa hiçbir değişiklik kaydedilmez.
            </p>
            {actionError && <ErrorBanner message={actionError} />}
            <div className={styles.formActions}>
              <Button variant="secondary" onClick={() => setShowMacroConfirm(false)}>Vazgeç</Button>
              <Button onClick={handleApplyMacro} loading={macroLoading}>Uygula</Button>
            </div>
          </>
        )}
      </Modal>

      {isCustomer && ticket.allowedActions.includes('confirm_resolution') && (
        <Card title="Çözüm Onayı" className={styles.sectionCard}>
          <p className={styles.lifecycleInfo}>Sorununuz çözüldüyse ticket'ı kapatabilir, devam ediyorsa yeniden açabilirsiniz.</p>
          <Textarea label="Sorun devam ediyorsa açıklayın" value={resolutionReason} onChange={(e) => setResolutionReason(e.target.value)} />
          <div className={styles.formActions}>
            <Button onClick={handleConfirmResolution}>Çözümü Onayla</Button>
            <Button variant="secondary" onClick={handleRejectResolution} disabled={!resolutionReason.trim()}>Sorun Devam Ediyor</Button>
          </div>
          {actionError && <p className={styles.actionError}>{actionError}</p>}
        </Card>
      )}

      {isCustomer && ticket.allowedActions.includes('create_follow_up') && (
        <Card title="Yeni Takip Ticket'ı" className={styles.sectionCard}>
          <p className={styles.lifecycleInfo}>Bu ticket kapalıdır. Yeni mesajınız ayrı bir ticket olarak oluşturulup bu kayda bağlanacaktır.</p>
          <Textarea label="Yeni Talebiniz" value={followUpDescription} onChange={(e) => setFollowUpDescription(e.target.value)} required />
          <Button onClick={handleFollowUp} disabled={!followUpDescription.trim()} style={{ marginTop: 8 }}>Takip Ticket'ı Oluştur</Button>
          {actionError && <p className={styles.actionError}>{actionError}</p>}
        </Card>
      )}

      <Card title="Aktivite Geçmişi" className={styles.sectionCard}>
        {activities.length === 0 ? (
          <p className={styles.activityEmpty}>Bu ticket için henüz geçmiş kaydı yok.</p>
        ) : (
          <div className={styles.activityTimeline}>
            {activities.map((activity) => (
              <div key={activity.id} className={styles.activityItem}>
                <span className={styles.activityMarker} aria-hidden="true" />
                <div className={styles.activityContent}>
                  <div className={styles.activityHeader}>
                    <span className={styles.activityDate}>
                      {formatIstanbulDateTime(activity.createdAt)}
                    </span>
                    <span className={styles.activitySource}>{activitySourceLabel(activity.source)}</span>
                  </div>
                  <p className={styles.activityDescription}>{activityDescription(activity)}</p>
                  {activity.reason && <p className={styles.activityReason}>Neden: {activity.reason}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
        {activities.length < activityTotal && (
          <Button
            variant="secondary"
            size="sm"
            onClick={loadMoreActivities}
            loading={activityLoading}
            className={styles.activityLoadMore}
          >
            Daha Fazla Göster
          </Button>
        )}
      </Card>

      <Card title="Yorumlar" className={styles.sectionCard}>
        {comments.length === 0 ? (
          <p className={styles.commentEmpty}>Henüz yorum yok.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className={styles.commentItem}>
              <div className={styles.commentHeader}>
                <strong className={styles.commentAuthor}>{c.author?.name}</strong>
                {c.type === 'internal_note' && <span className={styles.commentBadge}>İç Not</span>}
                <span className={styles.commentDate}>{formatIstanbulDateTime(c.createdAt)}</span>
              </div>
              <p className={styles.commentBody}>{c.body}</p>
            </div>
          ))
        )}

        {(ticket.status !== 'closed' || isAdmin) && (
          <form onSubmit={handleComment} className={styles.commentForm}>
            {isAgent && cannedResponses.length > 0 && (
              <Select
                label="Hazır Yanıt"
                value=""
                onChange={(event) => handleCannedResponse(event.target.value)}
                options={[
                  { value: '', label: 'Hazır yanıt seçin' },
                  ...cannedResponses.map((response) => ({
                    value: response.id,
                    label: `${response.name} (${response.commentType === 'public_reply' ? 'Genel' : 'İç Not'})`,
                  })),
                ]}
              />
            )}
            <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Yorumunuz..." required />
            {isAgent && (
              <Select value={commentType} onChange={(e) => setCommentType(e.target.value)} options={[
                { value: 'public_reply', label: 'Genel Yanıt' },
                { value: 'internal_note', label: 'İç Not' },
              ]} />
            )}
            <Button type="submit" style={{ marginTop: 4 }}>Gönder</Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export default TicketDetail;
