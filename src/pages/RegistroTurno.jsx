import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  isValidCustomerWhatsapp,
  listTurnRecordsHistory,
  listTurnRecordsByDate,
  maskCustomerWhatsapp,
  normalizeCustomerWhatsapp,
  saveTurnRecord,
  updateTurnRecordFollowUp,
} from '../services/turnRecordsService.js';

const TURN_OPTIONS = ['09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30'];
const MONTH_NAMES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const INTERNAL_ACCESS_SESSION_KEY = 'yaku_caja_unlocked';
const FOLLOW_UP_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente de contactar' },
  { value: 'sent', label: 'Mensaje enviado' },
  { value: 'interested', label: 'Interesado' },
  { value: 'purchased', label: 'Compró fotos' },
  { value: 'not_interested', label: 'No interesado' },
];
const FOLLOW_UP_STATUS_PREFIX = '[[seguimiento:';
const HISTORY_FILTERS = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'last7', label: 'Ultimos 7 dias' },
  { value: 'all', label: 'Todos' },
  { value: 'specific', label: 'Buscar fecha' },
];

function localDateValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function createPhotoCode(dateValue, turnTime) {
  if (!dateValue) return '';
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return '';
  const time = String(turnTime || '').replace(':', '');
  return `${String(day).padStart(2, '0')}${MONTH_NAMES[month - 1] || ''}-${time}`;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function percentValue(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function recordNumber(record, camelKey, snakeKey) {
  return numberValue(record?.[camelKey] ?? record?.[snakeKey]);
}

function recordBoolean(record, camelKey, snakeKey) {
  return record?.[camelKey] === true || record?.[snakeKey] === true || record?.[camelKey] === 'true' || record?.[snakeKey] === 'true';
}

function recordText(record, camelKey, snakeKey) {
  return String(record?.[camelKey] ?? record?.[snakeKey] ?? '').trim();
}

function getFollowUpStatus(record) {
  if (recordBoolean(record, 'purchasedExtraPhotos', 'purchased_extra_photos')) return 'purchased';
  const notesValue = recordText(record, 'notes', 'notes');
  const match = notesValue.match(/^\[\[seguimiento:([a-z_]+)\]\]\s*/);
  const value = match?.[1] || 'pending';
  return FOLLOW_UP_STATUS_OPTIONS.some((option) => option.value === value) ? value : 'pending';
}

function getFollowUpStatusLabel(recordOrValue) {
  const value = typeof recordOrValue === 'string' ? recordOrValue : getFollowUpStatus(recordOrValue);
  return FOLLOW_UP_STATUS_OPTIONS.find((option) => option.value === value)?.label || FOLLOW_UP_STATUS_OPTIONS[0].label;
}

function getVisibleNotes(record) {
  return recordText(record, 'notes', 'notes').replace(/^\[\[seguimiento:[a-z_]+\]\]\s*/, '').trim();
}

function buildStoredNotes(status, notesValue) {
  const safeStatus = FOLLOW_UP_STATUS_OPTIONS.some((option) => option.value === status) ? status : 'pending';
  const safeNotes = String(notesValue || '').trim();
  return `${FOLLOW_UP_STATUS_PREFIX}${safeStatus}]]${safeNotes ? ` ${safeNotes}` : ''}`;
}

function formatDateLabel(dateValue) {
  if (!dateValue) return 'Fecha sin definir';
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return dateValue;
  return new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(year, month - 1, day));
}

function addDays(dateValue, days) {
  const [year, month, day] = String(dateValue || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + days);
  const local = new Date(next.getTime() - next.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function historyRangeForFilter(filter, today, specificDate) {
  if (filter === 'today') return { from: today, to: today };
  if (filter === 'yesterday') {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (filter === 'last7') return { from: addDays(today, -6), to: today };
  if (filter === 'specific') return specificDate ? { from: specificDate, to: specificDate } : { from: today, to: today };
  return {};
}

function buildHistoryGroups(records) {
  const groups = new Map();
  records.forEach((record) => {
    const key = record.date || 'sin-fecha';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  return Array.from(groups.entries())
    .sort(([dateA], [dateB]) => String(dateB).localeCompare(String(dateA)))
    .map(([date, dayRecords]) => ({ date, records: dayRecords }));
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function recordMatchesHistorySearch(record, searchValue) {
  const query = normalizeSearchText(searchValue);
  if (!query) return true;

  const whatsappDigits = recordText(record, 'customerWhatsapp', 'customer_whatsapp').replace(/\D/g, '');
  const queryDigits = String(searchValue || '').replace(/\D/g, '');
  const whatsappLastDigits = whatsappDigits.slice(-4);
  const canMatchWhatsapp = queryDigits.length > 0
    && queryDigits.length <= 4
    && whatsappLastDigits.endsWith(queryDigits);
  if (canMatchWhatsapp) return true;

  const fullPassCount = recordNumber(record, 'fullPassCount', 'full_pass_count');
  const hasPhotos = recordBoolean(record, 'freePhotoRedeemed', 'free_photo_redeemed')
    || recordBoolean(record, 'purchasedExtraPhotos', 'purchased_extra_photos');
  const searchableText = normalizeSearchText([
    recordText(record, 'photoCode', 'photo_code'),
    recordText(record, 'turnTime', 'turn_time'),
    recordText(record, 'date', 'record_date'),
    formatDateLabel(recordText(record, 'date', 'record_date')),
    fullPassCount > 0 ? `full pass ${fullPassCount}` : 'sin full pass',
    hasPhotos ? 'fotos foto gratis fotos extra' : 'sin fotos',
  ].join(' '));

  return searchableText.includes(query);
}

function buildId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `turn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildCommercialSummary(records) {
  const totalGroups = records.length;
  const totalPeople = records.reduce((sum, record) => sum + recordNumber(record, 'totalPeople', 'total_people'), 0);
  const totalFullPass = records.reduce((sum, record) => sum + recordNumber(record, 'fullPassCount', 'full_pass_count'), 0);
  const groupsWithFreePhotoBenefit = records.filter((record) => (
    recordBoolean(record, 'hasFreePhotoBenefit', 'has_free_photo_benefit') || recordNumber(record, 'fullPassCount', 'full_pass_count') > 0
  )).length;
  const groupsWithWhatsapp = records.filter((record) => recordText(record, 'customerWhatsapp', 'customer_whatsapp')).length;
  const freePhotosRedeemed = records.filter((record) => recordBoolean(record, 'freePhotoRedeemed', 'free_photo_redeemed')).length;
  const pendingFollowUp = records.filter((record) => getFollowUpStatus(record) === 'pending').length;
  const messagesSent = records.filter((record) => getFollowUpStatus(record) === 'sent').length;
  const groupsPurchasedExtraPhotos = records.filter((record) => getFollowUpStatus(record) === 'purchased').length;
  const fullPassRate = percentValue(totalFullPass, totalPeople);
  const extraPhotoConversion = percentValue(groupsPurchasedExtraPhotos, groupsWithFreePhotoBenefit);
  return {
    totalGroups,
    totalPeople,
    totalFullPass,
    fullPassRate,
    groupsWithFreePhotoBenefit,
    groupsWithWhatsapp,
    freePhotosRedeemed,
    pendingFollowUp,
    messagesSent,
    groupsPurchasedExtraPhotos,
    extraPhotoConversion,
  };
}
function normalizeWhatsappForLink(value) {
  const cleaned = String(value || '').replace(/[^\d+]/g, '');
  const withoutPlus = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  const digits = withoutPlus.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9) return `51${digits}`;
  if (digits.startsWith('51') && digits.length >= 11 && digits.length <= 15) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return '';
}

function buildTurnWhatsappMessage(record) {
  const code = String(record?.photoCode || record?.photo_code || '').trim();
  if (!code) {
    return 'Hola, somos del sector de Fotografía de Yakupark. Acércate a Caja después de tu aventura en Yakupark para elegir tu foto gratuita.';
  }
  return `Hola, somos del sector de Fotografía de Yakupark. Tu código de fotos es ${code}. Acércate a Caja después de tu aventura en Yakupark para elegir tu foto gratuita.`;
}

function buildTurnWhatsappUrl(record) {
  const number = normalizeWhatsappForLink(recordText(record, 'customerWhatsapp', 'customer_whatsapp'));
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(buildTurnWhatsappMessage(record))}`;
}

export default function RegistroTurno() {
  const [accessGranted, setAccessGranted] = useState(readInternalAccessSession);
  const [pin, setPin] = useState('');
  const [accessError, setAccessError] = useState('');
  const configuredPin = String(import.meta.env.VITE_CAJA_PIN || '').trim();

  const submitAccess = (event) => {
    event.preventDefault();
    setAccessError('');
    if (!configuredPin) {
      setAccessError('El acceso interno no está configurado. Consulta con el responsable del sistema.');
      return;
    }
    if (pin.trim() !== configuredPin) {
      setAccessError('PIN incorrecto. Intenta nuevamente.');
      setPin('');
      return;
    }
    writeInternalAccessSession();
    setPin('');
    setAccessGranted(true);
  };

  if (!accessGranted) {
    return (
      <main className="turn-access-page">
        <form className="turn-access-card" onSubmit={submitAccess}>
          <span>YakuExpress interno</span>
          <h1>Acceso interno</h1>
          <p>Ingresa el PIN del equipo para registrar turnos.</p>
          <label>
            <span>PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value);
                setAccessError('');
              }}
              placeholder="Ingresa el PIN"
              autoFocus
            />
          </label>
          {accessError && <p className="turn-access-error" role="alert">{accessError}</p>}
          <button type="submit" disabled={!pin.trim()}>Ingresar</button>
          <small>El PIN no se guarda en este dispositivo.</small>
        </form>
      </main>
    );
  }

  return <RegistroTurnoWorkspace />;
}

function RegistroTurnoWorkspace() {
  const today = useMemo(() => localDateValue(), []);
  const [date] = useState(today);
  const [turnTime, setTurnTime] = useState(TURN_OPTIONS[0]);
  const photoCode = useMemo(() => createPhotoCode(date, turnTime), [date, turnTime]);
  const [totalPeople, setTotalPeople] = useState(0);
  const [fullPassCount, setFullPassCount] = useState(0);
  const [freePhotoRedeemed, setFreePhotoRedeemed] = useState(false);
  const [photoFollowUpStatus, setPhotoFollowUpStatus] = useState('pending');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [notes, setNotes] = useState('');
  const [records, setRecords] = useState([]);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historyStorage, setHistoryStorage] = useState('localStorage');
  const [historyFilter, setHistoryFilter] = useState('last7');
  const [historyDate, setHistoryDate] = useState(today);
  const [historySearch, setHistorySearch] = useState('');
  const [lastRecord, setLastRecord] = useState(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('success');
  const [recordsStorage, setRecordsStorage] = useState('localStorage');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [followUpRecord, setFollowUpRecord] = useState(null);
  const [followUpForm, setFollowUpForm] = useState({
    freePhotoRedeemed: false,
    status: 'pending',
    customerWhatsapp: '',
    notes: '',
  });
  const [isUpdatingFollowUp, setIsUpdatingFollowUp] = useState(false);
  const [followUpStatus, setFollowUpStatus] = useState({ tone: 'success', text: '' });

  const hasFreePhotoBenefit = fullPassCount > 0;
  const filteredHistoryRecords = useMemo(
    () => historyRecords.filter((record) => recordMatchesHistorySearch(record, historySearch)),
    [historyRecords, historySearch],
  );
  const historyGroups = useMemo(() => buildHistoryGroups(filteredHistoryRecords), [filteredHistoryRecords]);
  const hasHistorySearch = historySearch.trim().length > 0;

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    const range = historyRangeForFilter(historyFilter, today, historyDate);
    const result = await listTurnRecordsHistory(range);
    if (result.ok) {
      setHistoryRecords(result.data);
      setHistoryStorage(result.storage);
    } else {
      setHistoryRecords([]);
      setMessageTone('error');
      setMessage('No pudimos cargar el historial. Revisá la conexión e intentá nuevamente.');
    }
    setIsLoadingHistory(false);
  }, [historyDate, historyFilter, today]);

  useEffect(() => {
    if (!hasFreePhotoBenefit) {
      setFreePhotoRedeemed(false);
    }
  }, [hasFreePhotoBenefit]);

  useEffect(() => {
    let active = true;
    async function loadRecords() {
      setIsLoadingRecords(true);
      const result = await listTurnRecordsByDate(date);
      if (!active) return;
      if (result.ok) {
        setRecords(result.data);
        setRecordsStorage(result.storage);
      } else {
        setRecords([]);
        setMessageTone('error');
        setMessage('No pudimos cargar los registros. Revisá la conexión e intentá nuevamente.');
      }
      setIsLoadingRecords(false);
    }
    loadRecords();
    return () => { active = false; };
  }, [date]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const commercialSummary = useMemo(() => buildCommercialSummary(records), [records]);

  const refreshRecords = async () => {
    setIsLoadingRecords(true);
    const result = await listTurnRecordsByDate(date);
    if (result.ok) {
      setRecords(result.data);
      setRecordsStorage(result.storage);
      setMessageTone(result.storage === 'supabase' ? 'success' : 'warning');
      setMessage(result.storage === 'supabase' ? 'Registros actualizados desde la nube.' : 'Registros actualizados desde este dispositivo. La nube todavía no está disponible.');
    } else {
      setMessageTone('error');
      setMessage('No pudimos cargar los registros. Revisá la conexión e intentá nuevamente.');
    }
    setIsLoadingRecords(false);
    await loadHistory();
  };

  const handleTotalChange = (event) => {
    setTotalPeople(numberValue(event.target.value));
  };

  const openFollowUp = (record) => {
    setFollowUpRecord(record);
    setFollowUpForm({
      freePhotoRedeemed: Boolean(record.freePhotoRedeemed),
      status: getFollowUpStatus(record),
      customerWhatsapp: record.customerWhatsapp || '',
      notes: getVisibleNotes(record),
    });
    setFollowUpStatus({ tone: 'success', text: '' });
  };

  const closeFollowUp = () => {
    if (isUpdatingFollowUp) return;
    setFollowUpRecord(null);
    setFollowUpStatus({ tone: 'success', text: '' });
  };

  useEffect(() => {
    if (!followUpRecord) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !isUpdatingFollowUp) closeFollowUp();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [followUpRecord, isUpdatingFollowUp]);

  const updateFollowUpField = (key, value) => {
    setFollowUpStatus({ tone: 'success', text: '' });
    setFollowUpForm((current) => ({ ...current, [key]: value }));
  };

  const submitFollowUp = async (event) => {
    event.preventDefault();
    if (!followUpRecord?.id) return;
    setFollowUpStatus({ tone: 'success', text: '' });
    const safeFollowUpWhatsapp = normalizeCustomerWhatsapp(followUpForm.customerWhatsapp);
    if (safeFollowUpWhatsapp && !isValidCustomerWhatsapp(safeFollowUpWhatsapp)) {
      setFollowUpStatus({ tone: 'error', text: 'Ingresa un WhatsApp válido o deja el campo vacío.' });
      return;
    }
    setIsUpdatingFollowUp(true);
    const result = await updateTurnRecordFollowUp(followUpRecord.id, {
      freePhotoRedeemed: followUpForm.freePhotoRedeemed,
      purchasedExtraPhotos: followUpForm.status === 'purchased',
      customerWhatsapp: safeFollowUpWhatsapp,
      notes: buildStoredNotes(followUpForm.status, followUpForm.notes),
    });

    if (result.ok) {
      setFollowUpStatus({ tone: 'success', text: 'Seguimiento actualizado.' });
      setMessageTone(result.storage === 'supabase' ? 'success' : 'warning');
      setMessage(result.storage === 'supabase'
        ? 'Seguimiento actualizado.'
        : 'Seguimiento operativo actualizado en este dispositivo. WhatsApp y notas no se guardan localmente.');
      const refreshed = await listTurnRecordsByDate(date);
      if (refreshed.ok) {
        setRecords(refreshed.data);
        setRecordsStorage(refreshed.storage);
      } else {
        setRecords((current) => current.map((item) => (item.id === result.data.id ? result.data : item)));
      }
      await loadHistory();
      setLastRecord((current) => (current?.id === result.data.id ? result.data : current));
      setFollowUpRecord(null);
    } else {
      setFollowUpStatus({
        tone: 'warning',
        text: result.message || 'Todavía no se puede actualizar en la nube. Falta habilitar edición segura.',
      });
    }
    setIsUpdatingFollowUp(false);
  };
  const saveRecord = async (event) => {
    event.preventDefault();
    setMessage('');
    const safeFullPassCount = numberValue(fullPassCount);
    const safeHasFreePhotoBenefit = safeFullPassCount > 0;
    const safeTotalPeople = numberValue(totalPeople);
    const safeCustomerWhatsapp = normalizeCustomerWhatsapp(customerWhatsapp);
    if (safeTotalPeople <= 0) {
      setMessageTone('error');
      setMessage('Agrega al menos una persona para registrar el turno.');
      return;
    }
    if (safeCustomerWhatsapp && !isValidCustomerWhatsapp(safeCustomerWhatsapp)) {
      setMessageTone('error');
      setMessage('Ingresa un WhatsApp válido o deja el campo vacío.');
      return;
    }
    if (safeFullPassCount > safeTotalPeople) {
      setMessageTone('error');
      setMessage('La cantidad de Full Pass no puede superar el total de personas.');
      return;
    }
    setIsSaving(true);
    const record = {
      id: buildId(),
      date,
      turnTime,
      photoCode: photoCode.toUpperCase(),
      totalPeople: safeTotalPeople,
      standardCount: 0,
      fullPassCount: safeFullPassCount,
      kidsCount: 0,
      premiumKidsCount: 0,
      fullDayCount: 0,
      yakutoboganCount: 0,
      hasFreePhotoBenefit: safeHasFreePhotoBenefit,
      freePhotoRedeemed: safeHasFreePhotoBenefit ? freePhotoRedeemed : false,
      purchasedExtraPhotos: photoFollowUpStatus === 'purchased',
      customerWhatsapp: safeCustomerWhatsapp,
      notes: buildStoredNotes(photoFollowUpStatus, notes),
      createdAt: new Date().toISOString(),
    };

    const result = await saveTurnRecord(record);
    if (result.ok) {
      setLastRecord(result.data);
      setMessageTone(result.storage === 'supabase' ? 'success' : 'warning');
      setMessage(result.storage === 'supabase'
        ? 'Registro guardado en la nube.'
        : 'Registro operativo guardado en este dispositivo. WhatsApp y notas no se guardaron localmente.');
      const refreshed = await listTurnRecordsByDate(date);
      if (refreshed.ok) {
        setRecords(refreshed.data);
        setRecordsStorage(refreshed.storage);
      } else {
        setRecords((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
      }
      await loadHistory();
      setFullPassCount(0);
      setNotes('');
      setFreePhotoRedeemed(false);
      setPhotoFollowUpStatus('pending');
      setCustomerWhatsapp('');
      setTotalPeople(0);
    } else {
      setMessageTone('error');
      setMessage('No pudimos guardar el registro. Revisá la conexión e intentá nuevamente.');
    }
    setIsSaving(false);
  };

  return (
    <main className="turn-register-page">
      <section className="turn-register-hero">
        <div>
          <span className="turn-register-kicker">YakuExpress interno</span>
          <h1>Registro de turnos</h1>
          <p>Control operativo y seguimiento comercial del día.</p>
        </div>
        <div className="turn-register-privacy">
          <strong>Herramienta interna</strong>
          <span>Usá solo datos operativos. No registres DNI, nombres completos ni información sensible.</span>
        </div>
      </section>

      <section className="turn-register-card turn-overview-section" aria-labelledby="turn-overview-title">
        <div className="turn-section-header">
          <div className="turn-register-card-head">
            <span>Resumen del día</span>
            <h2 id="turn-overview-title">{formatDateLabel(date)}</h2>
            <p>Lectura rápida de ingresos, beneficios y oportunidades de seguimiento.</p>
          </div>
          <div className="turn-overview-source">
            <span>Fuente</span>
            <strong>{recordsStorage === 'supabase' ? 'Nube' : 'Este dispositivo'}</strong>
          </div>
        </div>

        <div className="turn-overview-grid">
          <article>
            <span>Grupos</span>
            <strong>{commercialSummary.totalGroups}</strong>
            <small>registrados</small>
          </article>
          <article>
            <span>Personas</span>
            <strong>{commercialSummary.totalPeople}</strong>
            <small>en el día</small>
          </article>
          <article className="accent">
            <span>Con WhatsApp</span>
            <strong>{commercialSummary.groupsWithWhatsapp}</strong>
            <small>contactos registrados</small>
          </article>
          <article className={commercialSummary.pendingFollowUp ? 'attention' : ''}>
            <span>Pendientes</span>
            <strong>{commercialSummary.pendingFollowUp}</strong>
            <small>por contactar</small>
          </article>
          <article>
            <span>Mensajes</span>
            <strong>{commercialSummary.messagesSent}</strong>
            <small>marcados como enviados</small>
          </article>
          <article>
            <span>Compras</span>
            <strong>{commercialSummary.groupsPurchasedExtraPhotos}</strong>
            <small>compraron fotos</small>
          </article>
        </div>

        <div className="turn-overview-details">
          <div><strong>{commercialSummary.totalFullPass}</strong><span>Full Pass registrados</span></div>
          <div><strong>{commercialSummary.groupsWithFreePhotoBenefit}</strong><span>Grupos con beneficio</span></div>
          <div><strong>{commercialSummary.freePhotosRedeemed}</strong><span>Fotos gratis usadas</span></div>
          <div><strong>{commercialSummary.extraPhotoConversion}%</strong><span>Conversión a compra</span></div>
        </div>
      </section>

      <section className="turn-register-layout">
        <form className="turn-register-card turn-register-form" onSubmit={saveRecord}>
          <div className="turn-register-card-head">
            <span>Nuevo registro</span>
            <h2>Registrar grupo</h2>
            <p>Guardá los datos necesarios para contactar al grupo y hacer seguimiento de sus fotos.</p>
          </div>

          <div className="turn-form-section">
            <div className="turn-form-section-head">
              <span>1</span>
              <div>
                <strong>Visita y fotos</strong>
                <small>Elegí el horario y el código se arma solo.</small>
              </div>
            </div>
            <div className="turn-auto-summary" aria-label="Datos automáticos del registro">
              <div>
                <span>Fecha automática</span>
                <strong>{formatDateLabel(date)}</strong>
              </div>
              <div>
                <span>Código de fotos</span>
                <strong>{photoCode}</strong>
              </div>
            </div>
            <div className="turn-register-fields">
              <label>
                <span>Horario *</span>
                <select value={turnTime} onChange={(event) => setTurnTime(event.target.value)}>
                  {TURN_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Total de personas *</span>
                <input type="number" min="0" value={totalPeople} onChange={handleTotalChange} />
              </label>
            </div>

          </div>

          <div className="turn-form-section">
            <div className="turn-form-section-head">
              <span>2</span>
              <div>
                <strong>Contacto y seguimiento</strong>
                <small>Full Pass, estado, WhatsApp y notas en un solo paso.</small>
              </div>
            </div>
            <div className="turn-register-fields turn-commercial-fields">
              <label>
                <span>Cantidad de Full Pass</span>
                <input
                  type="number"
                  min="0"
                  max={totalPeople || undefined}
                  value={fullPassCount}
                  onChange={(event) => setFullPassCount(numberValue(event.target.value))}
                />
                <small>Ingresá 0 si el grupo no tiene Full Pass.</small>
              </label>
              <label>
                <span>Estado de seguimiento *</span>
                <select value={photoFollowUpStatus} onChange={(event) => setPhotoFollowUpStatus(event.target.value)}>
                  {FOLLOW_UP_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="turn-whatsapp-field">
                <span>WhatsApp del cliente</span>
                <input
                  type="tel"
                  value={customerWhatsapp}
                  onChange={(event) => setCustomerWhatsapp(event.target.value)}
                  placeholder="Ej. 999 999 999"
                  inputMode="tel"
                />
                <small>Se usa para enviar el mensaje con el código de fotos.</small>
              </label>
            </div>
            <label className="turn-notes-field">
              <span>Notas opcionales</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows="3"
                placeholder="Ej: familia grande, vuelve por fotos o grupo escolar..."
              />
            </label>
            <p className="turn-privacy-note">No ingreses nombres completos, DNI ni otros datos sensibles.</p>
          </div>

          <button className="turn-register-submit" type="submit" disabled={isSaving}>
            {isSaving ? 'Guardando registro...' : 'Guardar registro del turno'}
          </button>
          {message && <p className={`turn-register-message ${messageTone}`} role="status">{message}</p>}
        </form>

        <aside className="turn-register-stack">
          <section className="turn-register-card turn-operations-guide">
            <span>Flujo operativo</span>
            <h2>Seguimiento de fotos</h2>
            <ol>
              <li>Registrá el grupo y su código de fotos.</li>
              <li>Enviá el acceso por WhatsApp.</li>
              <li>Actualizá si se interesó o compró.</li>
            </ol>
          </section>

          {lastRecord && (
            <section className="turn-register-card turn-last-record">
              <span>Último registro</span>
              <strong>{lastRecord.photoCode}</strong>
              <p>{lastRecord.totalPeople} personas · {lastRecord.fullPassCount} Full Pass</p>
              <p className="turn-contact-badge">WhatsApp: {lastRecord.customerWhatsapp ? `Registrado ${maskCustomerWhatsapp(lastRecord.customerWhatsapp)}` : 'Sin registrar'}</p>
              <div className="turn-record-badges">
                <span>{lastRecord.storage === 'supabase' ? 'Nube' : 'Este dispositivo'}</span>
                <span>{getFollowUpStatusLabel(lastRecord)}</span>
                <span>{lastRecord.customerWhatsapp ? 'WhatsApp registrado' : 'Sin WhatsApp'}</span>
              </div>
            </section>
          )}
        </aside>
      </section>

      <section className="turn-register-card turn-records-section">
        <div className="turn-records-header">
          <div className="turn-register-card-head">
            <span>Registros del día</span>
            <h2>Grupos y seguimiento comercial</h2>
            <p>Revisá el código de fotos, el beneficio y las acciones pendientes de cada grupo.</p>
          </div>
          <button type="button" onClick={refreshRecords} disabled={isLoadingRecords}>
            {isLoadingRecords ? 'Actualizando...' : 'Actualizar registros'}
          </button>
        </div>
        <p className="turn-record-source">Fuente actual: {recordsStorage === 'supabase' ? 'Nube' : 'Este dispositivo'}</p>
        {records.length ? (
          <div className="turn-record-list">
            {records.map((record) => (
              <article className="turn-record-item" key={record.id}>
                <div className="turn-record-main">
                  <div className="turn-record-title">
                    <span>{record.turnTime}</span>
                    <strong>{record.photoCode}</strong>
                  </div>
                  <small className="turn-record-note">{getVisibleNotes(record) || 'Sin observaciones'}</small>
                  <div className="turn-record-badges">
                    <span>{record.storage === 'supabase' ? 'Nube' : 'Este dispositivo'}</span>
                    <span className={`turn-followup-badge ${getFollowUpStatus(record)}`}>{getFollowUpStatusLabel(record)}</span>
                    <span>{record.customerWhatsapp ? 'WhatsApp registrado' : 'Sin WhatsApp'}</span>
                  </div>
                </div>
                <dl className="turn-record-metrics">
                  <div><dt>Personas</dt><dd>{record.totalPeople}</dd></div>
                  <div><dt>Full Pass</dt><dd>{record.fullPassCount}</dd></div>
                  <div><dt>Seguimiento</dt><dd>{getFollowUpStatusLabel(record)}</dd></div>
                  <div><dt>WhatsApp</dt><dd>{record.customerWhatsapp ? maskCustomerWhatsapp(record.customerWhatsapp) : 'No registrado'}</dd></div>
                </dl>

                <div className="turn-record-actions turn-whatsapp-action">
                  {record.customerWhatsapp && (
                    buildTurnWhatsappUrl(record) ? (
                      <a
                        className="turn-whatsapp-button"
                        href={buildTurnWhatsappUrl(record)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Enviar WhatsApp sobre foto gratis"
                      >
                        Abrir WhatsApp
                      </a>
                    ) : (
                      <span className="turn-whatsapp-disabled">WhatsApp no válido</span>
                    )
                  )}
                  <button className="turn-followup-action" type="button" onClick={() => openFollowUp(record)}>
                    Actualizar seguimiento
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="turn-record-empty">Todavía no hay grupos guardados para esta fecha.</p>
        )}
      </section>

      <section className="turn-register-card turn-history-section" aria-labelledby="turn-history-title">
        <div className="turn-records-header">
          <div className="turn-register-card-head">
            <span>Historial por días</span>
            <h2 id="turn-history-title">Historial por días</h2>
            <p>Revisá registros anteriores sin reemplazar el resumen del día actual.</p>
          </div>
          <div className="turn-overview-source">
            <span>Fuente</span>
            <strong>{historyStorage === 'supabase' ? 'Nube' : 'Este dispositivo'}</strong>
          </div>
        </div>

        <div className="turn-history-filters" aria-label="Filtros de historial">
          {HISTORY_FILTERS.map((option) => (
            <button
              key={option.value}
              className={historyFilter === option.value ? 'active' : ''}
              type="button"
              onClick={() => setHistoryFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
          {historyFilter === 'specific' && (
            <label>
              <span>Fecha específica</span>
              <input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} />
            </label>
          )}
        </div>

        <label className="turn-history-search">
          <span>Buscar en historial</span>
          <input
            type="search"
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="Buscar por código, horario o últimos dígitos..."
            autoComplete="off"
          />
        </label>

        {isLoadingHistory ? (
          <p className="turn-history-empty">Cargando historial...</p>
        ) : historyGroups.length ? (
          <div className="turn-history-days">
            {historyGroups.map(({ date: groupDate, records: dayRecords }) => {
              const daySummary = buildCommercialSummary(dayRecords);
              return (
                <article className="turn-history-day" key={groupDate}>
                  <div className="turn-history-day-head">
                    <div>
                      <span>Resumen del día</span>
                      <h3>{formatDateLabel(groupDate)}</h3>
                    </div>
                    <strong>{daySummary.totalGroups} registros</strong>
                  </div>

                  <div className="turn-history-summary">
                    <div><span>Personas</span><strong>{daySummary.totalPeople}</strong></div>
                    <div><span>WhatsApp</span><strong>{daySummary.groupsWithWhatsapp}</strong></div>
                    <div><span>Full Pass</span><strong>{daySummary.totalFullPass}</strong></div>
                    <div><span>Fotos</span><strong>{daySummary.freePhotosRedeemed + daySummary.groupsPurchasedExtraPhotos}</strong></div>
                  </div>

                  <details className="turn-history-details" open={historyGroups.length === 1}>
                    <summary>Ver registros</summary>
                    <div className="turn-history-records">
                      {dayRecords.map((record) => (
                        <article className="turn-history-record" key={record.id}>
                          <div>
                            <span>{record.turnTime || 'Sin horario'}</span>
                            <strong>{record.photoCode || 'Sin código'}</strong>
                            <small>{getVisibleNotes(record) || 'Sin nota'}</small>
                          </div>
                          <dl>
                            <div><dt>Personas</dt><dd>{record.totalPeople}</dd></div>
                            <div><dt>WhatsApp</dt><dd>{record.customerWhatsapp ? maskCustomerWhatsapp(record.customerWhatsapp) : 'No registrado'}</dd></div>
                            <div><dt>Full Pass</dt><dd>{record.fullPassCount}</dd></div>
                            <div><dt>Fotos</dt><dd>{record.freePhotoRedeemed || record.purchasedExtraPhotos ? 'Si' : 'No'}</dd></div>
                          </dl>
                          <div className="turn-history-actions">
                            {record.customerWhatsapp ? (
                              buildTurnWhatsappUrl(record) ? (
                                <a
                                  className="turn-whatsapp-button"
                                  href={buildTurnWhatsappUrl(record)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Enviar WhatsApp desde historial"
                                >
                                  Enviar WhatsApp
                                </a>
                              ) : (
                                <span className="turn-whatsapp-disabled">WhatsApp inválido</span>
                              )
                            ) : (
                              <span className="turn-whatsapp-disabled">Sin WhatsApp</span>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="turn-history-empty">
            {hasHistorySearch ? 'No encontramos registros con esa búsqueda.' : 'No hay registros para esta fecha.'}
          </p>
        )}
      </section>

      {followUpRecord && (
        <div className="turn-followup-modal" role="dialog" aria-modal="true" aria-labelledby="turn-followup-title">
          <form className="turn-followup-panel" onSubmit={submitFollowUp}>
            <div className="turn-followup-head">
              <div className="turn-register-card-head">
                <span>Seguimiento comercial</span>
                <h2 id="turn-followup-title">Actualizar seguimiento</h2>
                <p>{followUpRecord.photoCode} · {followUpRecord.turnTime}</p>
              </div>
              <button
                className="turn-followup-close"
                type="button"
                onClick={closeFollowUp}
                disabled={isUpdatingFollowUp}
                aria-label="Cerrar seguimiento"
              >
                ×
              </button>
            </div>

            <div className="turn-followup-options">
              <label className="turn-followup-field">
                <span>Estado de seguimiento</span>
                <select
                  value={followUpForm.status}
                  onChange={(event) => updateFollowUpField('status', event.target.value)}
                >
                  {FOLLOW_UP_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              {followUpRecord.hasFreePhotoBenefit && (
                <label>
                  <input
                    type="checkbox"
                    checked={followUpForm.freePhotoRedeemed}
                    onChange={(event) => updateFollowUpField('freePhotoRedeemed', event.target.checked)}
                  />
                  <span>Foto gratis usada</span>
                </label>
              )}
            </div>

            <label className="turn-followup-field">
              <span>WhatsApp del cliente</span>
              <input
                type="tel"
                value={followUpForm.customerWhatsapp}
                onChange={(event) => updateFollowUpField('customerWhatsapp', event.target.value)}
                placeholder="Ej. 999 999 999"
                inputMode="tel"
              />
              <small>Opcional. Se muestra enmascarado fuera de este panel.</small>
            </label>

            <label className="turn-followup-field">
              <span>Observación de seguimiento</span>
              <textarea
                value={followUpForm.notes}
                onChange={(event) => updateFollowUpField('notes', event.target.value)}
                rows="3"
                placeholder="Ej: volvió después del turno, pidió link, compró fotos en caja..."
              />
            </label>

            {followUpStatus.text && <p className={`turn-followup-status ${followUpStatus.tone}`}>{followUpStatus.text}</p>}

            <div className="turn-followup-actions">
              <button type="button" onClick={closeFollowUp} disabled={isUpdatingFollowUp}>Cancelar</button>
              <button type="submit" disabled={isUpdatingFollowUp}>
                {isUpdatingFollowUp ? 'Actualizando...' : 'Guardar seguimiento'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function readInternalAccessSession() {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(INTERNAL_ACCESS_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeInternalAccessSession() {
  try {
    window.sessionStorage.setItem(INTERNAL_ACCESS_SESSION_KEY, 'true');
  } catch {
    // El acceso sigue activo en memoria aunque sessionStorage no esté disponible.
  }
}
