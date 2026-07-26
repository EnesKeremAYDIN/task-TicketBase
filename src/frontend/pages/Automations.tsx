import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  createCannedResponse,
  createTicketMacro,
  getCannedResponses,
  getTicketMacros,
  updateCannedResponse,
  updateTicketMacro,
} from '../lib/api';
import { getStoredUser } from '../lib/auth-user';
import type {
  CannedResponse,
  MacroAction,
  Priority,
  Status,
  TicketMacro,
} from '../lib/types';
import Button from '../components/Button/Button';
import Card from '../components/Card/Card';
import ErrorBanner from '../components/ErrorBanner/ErrorBanner';
import Input from '../components/Input/Input';
import Loading from '../components/Loading/Loading';
import Modal from '../components/Modal/Modal';
import Select from '../components/Select/Select';
import Textarea from '../components/Textarea/Textarea';
import styles from './Automations.module.css';
import { macroActionLabel } from '../lib/automation';

const COMMENT_TYPE_OPTIONS = [
  { value: 'public_reply', label: 'Genel Yanıt' },
  { value: 'internal_note', label: 'İç Not' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Durum değişmesin' },
  { value: 'open', label: 'Açık' },
  { value: 'pending', label: 'Beklemede' },
  { value: 'resolved', label: 'Çözüldü' },
  { value: 'closed', label: 'Kapalı' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Öncelik değişmesin' },
  { value: 'low', label: 'Düşük' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'urgent', label: 'Acil' },
];

const EMPTY_RESPONSE_FORM = {
  name: '',
  body: '',
  commentType: 'public_reply' as CannedResponse['commentType'],
  isActive: true,
};

const EMPTY_MACRO_FORM = {
  name: '',
  description: '',
  commentBody: '',
  commentType: 'public_reply' as CannedResponse['commentType'],
  status: '' as '' | Exclude<Status, 'new'>,
  statusReason: '',
  pendingOffsetHours: '48',
  priority: '' as '' | Priority,
  assignSelf: false,
  isActive: true,
};

export default function Automations() {
  const user = getStoredUser();
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [macros, setMacros] = useState<TicketMacro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [responseForm, setResponseForm] = useState(EMPTY_RESPONSE_FORM);
  const [macroForm, setMacroForm] = useState(EMPTY_MACRO_FORM);
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null);
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
  const [showResponseForm, setShowResponseForm] = useState(false);
  const [showMacroForm, setShowMacroForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [responseResult, macroResult] = await Promise.allSettled([
      getCannedResponses(true),
      getTicketMacros(true),
    ]);

    if (responseResult.status === 'fulfilled') {
      setResponses(responseResult.value);
    } else {
      setResponses([]);
      setError(responseResult.reason instanceof Error
        ? responseResult.reason.message
        : 'Hazır yanıtlar yüklenemedi');
    }

    if (macroResult.status === 'fulfilled') {
      setMacros(macroResult.value);
    } else {
      setMacros([]);
      setError((current) => current || (
        macroResult.reason instanceof Error ? macroResult.reason.message : 'Makrolar yüklenemedi'
      ));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') void load();
  }, [load, user?.role]);

  if (user?.role !== 'admin') return <Navigate to="/tickets" replace />;

  function openNewResponse() {
    setEditingResponseId(null);
    setResponseForm(EMPTY_RESPONSE_FORM);
    setFormError('');
    setShowResponseForm(true);
  }

  function openResponse(response: CannedResponse) {
    setEditingResponseId(response.id);
    setResponseForm({
      name: response.name,
      body: response.body,
      commentType: response.commentType,
      isActive: response.isActive,
    });
    setFormError('');
    setShowResponseForm(true);
  }

  function openNewMacro() {
    setEditingMacroId(null);
    setMacroForm(EMPTY_MACRO_FORM);
    setFormError('');
    setShowMacroForm(true);
  }

  function openMacro(macro: TicketMacro) {
    const commentAction = macro.actions.find((action) => action.type === 'comment');
    const statusAction = macro.actions.find((action) => action.type === 'status');
    const priorityAction = macro.actions.find((action) => action.type === 'priority');
    setEditingMacroId(macro.id);
    setMacroForm({
      name: macro.name,
      description: macro.description || '',
      commentBody: commentAction?.type === 'comment' ? commentAction.body : '',
      commentType: commentAction?.type === 'comment'
        ? commentAction.commentType
        : 'public_reply',
      status: statusAction?.type === 'status' ? statusAction.status : '',
      statusReason: statusAction?.type === 'status' ? statusAction.reason || '' : '',
      pendingOffsetHours: statusAction?.type === 'status'
        ? String(statusAction.pendingOffsetHours || 48)
        : '48',
      priority: priorityAction?.type === 'priority' ? priorityAction.priority : '',
      assignSelf: macro.actions.some((action) => action.type === 'assign_self'),
      isActive: macro.isActive,
    });
    setFormError('');
    setShowMacroForm(true);
  }

  async function saveResponse(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editingResponseId) {
        await updateCannedResponse(editingResponseId, responseForm);
      } else {
        await createCannedResponse(responseForm);
      }
      setShowResponseForm(false);
      await load();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Hazır yanıt kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  async function saveMacro(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');
    const actions = buildMacroActions();
    if (actions.length === 0) {
      setFormError('En az bir makro işlemi seçin.');
      return;
    }
    if (macroForm.status === 'pending' && !macroForm.statusReason.trim()) {
      setFormError('Pending işlemi için neden zorunludur.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: macroForm.name,
        description: macroForm.description,
        actions,
        isActive: macroForm.isActive,
      };
      if (editingMacroId) {
        await updateTicketMacro(editingMacroId, payload);
      } else {
        await createTicketMacro(payload);
      }
      setShowMacroForm(false);
      await load();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Makro kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  function buildMacroActions(): MacroAction[] {
    const actions: MacroAction[] = [];
    if (macroForm.commentBody.trim()) {
      actions.push({
        type: 'comment',
        commentType: macroForm.commentType,
        body: macroForm.commentBody.trim(),
      });
    }
    if (macroForm.priority) {
      actions.push({ type: 'priority', priority: macroForm.priority });
    }
    if (macroForm.assignSelf) {
      actions.push({ type: 'assign_self' });
    }
    if (macroForm.status) {
      actions.push({
        type: 'status',
        status: macroForm.status,
        reason: macroForm.statusReason.trim() || undefined,
        pendingOffsetHours: macroForm.status === 'pending'
          ? Number(macroForm.pendingOffsetHours)
          : undefined,
      });
    }
    return actions;
  }

  async function toggleResponse(response: CannedResponse) {
    setError('');
    try {
      await updateCannedResponse(response.id, { isActive: !response.isActive });
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Hazır yanıt güncellenemedi');
    }
  }

  async function toggleMacro(macro: TicketMacro) {
    setError('');
    try {
      await updateTicketMacro(macro.id, { isActive: !macro.isActive });
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Makro güncellenemedi');
    }
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Operasyon Araçları</h1>
          <p className={styles.subtitle}>Tekrarlanan yanıtları ve ticket işlemlerini standartlaştırın.</p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? <Loading /> : (
        <div className={styles.sections}>
          <Card>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Hazır Yanıtlar</h2>
                <p>Agent yorum alanına aktarılır; gönderilmeden önce düzenlenebilir.</p>
              </div>
              <Button size="sm" onClick={openNewResponse}>Yeni Hazır Yanıt</Button>
            </div>
            {responses.length === 0 ? (
              <p className={styles.empty}>Hazır yanıt bulunmuyor.</p>
            ) : (
              <div className={styles.itemList}>
                {responses.map((response) => (
                  <article key={response.id} className={styles.item}>
                    <div className={styles.itemContent}>
                      <div className={styles.itemTitleRow}>
                        <strong>{response.name}</strong>
                        <span className={response.isActive ? styles.active : styles.inactive}>
                          {response.isActive ? 'Aktif' : 'Pasif'}
                        </span>
                      </div>
                      <span className={styles.meta}>
                        {response.commentType === 'public_reply' ? 'Genel Yanıt' : 'İç Not'}
                      </span>
                      <p className={styles.preview}>{response.body}</p>
                    </div>
                    <div className={styles.itemActions}>
                      <Button size="sm" variant="secondary" onClick={() => openResponse(response)}>
                        Düzenle
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void toggleResponse(response)}>
                        {response.isActive ? 'Pasife Al' : 'Aktifleştir'}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Makrolar</h2>
                <p>Birden fazla ticket işlemini tek ve atomik bir adımda uygular.</p>
              </div>
              <Button size="sm" onClick={openNewMacro}>Yeni Makro</Button>
            </div>
            {macros.length === 0 ? (
              <p className={styles.empty}>Makro bulunmuyor.</p>
            ) : (
              <div className={styles.itemList}>
                {macros.map((macro) => (
                  <article key={macro.id} className={styles.item}>
                    <div className={styles.itemContent}>
                      <div className={styles.itemTitleRow}>
                        <strong>{macro.name}</strong>
                        <span className={macro.isActive ? styles.active : styles.inactive}>
                          {macro.isActive ? 'Aktif' : 'Pasif'}
                        </span>
                      </div>
                      {macro.description && <p className={styles.description}>{macro.description}</p>}
                      <ul className={styles.actionSummary}>
                        {macro.actions.map((action) => (
                          <li key={action.type}>{macroActionLabel(action)}</li>
                        ))}
                      </ul>
                    </div>
                    <div className={styles.itemActions}>
                      <Button size="sm" variant="secondary" onClick={() => openMacro(macro)}>
                        Düzenle
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void toggleMacro(macro)}>
                        {macro.isActive ? 'Pasife Al' : 'Aktifleştir'}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal
        open={showResponseForm}
        onClose={() => setShowResponseForm(false)}
        title={editingResponseId ? 'Hazır Yanıtı Düzenle' : 'Yeni Hazır Yanıt'}
      >
        <form onSubmit={saveResponse}>
          <Input
            label="Ad"
            value={responseForm.name}
            onChange={(event) => setResponseForm({ ...responseForm, name: event.target.value })}
            required
          />
          <Select
            label="Yorum Türü"
            value={responseForm.commentType}
            onChange={(event) => setResponseForm({
              ...responseForm,
              commentType: event.target.value as CannedResponse['commentType'],
            })}
            options={COMMENT_TYPE_OPTIONS}
          />
          <Textarea
            label="Yanıt Metni"
            value={responseForm.body}
            onChange={(event) => setResponseForm({ ...responseForm, body: event.target.value })}
            rows={7}
            required
          />
          <TemplateHelp />
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={responseForm.isActive}
              onChange={(event) => setResponseForm({ ...responseForm, isActive: event.target.checked })}
            />
            Aktif
          </label>
          {formError && <ErrorBanner message={formError} />}
          <div className={styles.formActions}>
            <Button type="button" variant="secondary" onClick={() => setShowResponseForm(false)}>
              Vazgeç
            </Button>
            <Button type="submit" loading={saving}>Kaydet</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showMacroForm}
        onClose={() => setShowMacroForm(false)}
        title={editingMacroId ? 'Makroyu Düzenle' : 'Yeni Makro'}
      >
        <form onSubmit={saveMacro}>
          <Input
            label="Ad"
            value={macroForm.name}
            onChange={(event) => setMacroForm({ ...macroForm, name: event.target.value })}
            required
          />
          <Input
            label="Açıklama"
            value={macroForm.description}
            onChange={(event) => setMacroForm({ ...macroForm, description: event.target.value })}
          />
          <Textarea
            label="Yorum Metni (opsiyonel)"
            value={macroForm.commentBody}
            onChange={(event) => setMacroForm({ ...macroForm, commentBody: event.target.value })}
            rows={5}
          />
          {macroForm.commentBody && (
            <Select
              label="Yorum Türü"
              value={macroForm.commentType}
              onChange={(event) => setMacroForm({
                ...macroForm,
                commentType: event.target.value as CannedResponse['commentType'],
              })}
              options={COMMENT_TYPE_OPTIONS}
            />
          )}
          <TemplateHelp />
          <Select
            label="Öncelik İşlemi"
            value={macroForm.priority}
            onChange={(event) => setMacroForm({
              ...macroForm,
              priority: event.target.value as '' | Priority,
            })}
            options={PRIORITY_OPTIONS}
          />
          <Select
            label="Durum İşlemi"
            value={macroForm.status}
            onChange={(event) => setMacroForm({
              ...macroForm,
              status: event.target.value as '' | Exclude<Status, 'new'>,
            })}
            options={STATUS_OPTIONS}
          />
          {macroForm.status && (
            <Input
              label="Durum Değişikliği Nedeni"
              value={macroForm.statusReason}
              onChange={(event) => setMacroForm({ ...macroForm, statusReason: event.target.value })}
              required={macroForm.status === 'pending'}
            />
          )}
          {macroForm.status === 'pending' && (
            <Input
              label="Bekleme Süresi (saat)"
              type="number"
              min="1"
              max="720"
              value={macroForm.pendingOffsetHours}
              onChange={(event) => setMacroForm({
                ...macroForm,
                pendingOffsetHours: event.target.value,
              })}
              required
            />
          )}
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={macroForm.assignSelf}
              onChange={(event) => setMacroForm({ ...macroForm, assignSelf: event.target.checked })}
            />
            Çalıştıran ajan ticketı kendine atasın
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={macroForm.isActive}
              onChange={(event) => setMacroForm({ ...macroForm, isActive: event.target.checked })}
            />
            Aktif
          </label>
          {formError && <ErrorBanner message={formError} />}
          <div className={styles.formActions}>
            <Button type="button" variant="secondary" onClick={() => setShowMacroForm(false)}>
              Vazgeç
            </Button>
            <Button type="submit" loading={saving}>Kaydet</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function TemplateHelp() {
  return (
    <p className={styles.templateHelp}>
      Kullanılabilir değişkenler: {'{{customer.name}}'}, {'{{ticket.displayId}}'},
      {' {{ticket.title}}'}, {' {{agent.name}}'}
    </p>
  );
}
