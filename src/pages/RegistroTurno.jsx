import React, { useEffect, useMemo, useState } from 'react';
import { listTurnRecordsByDate, maskCustomerWhatsapp, normalizeCustomerWhatsapp, saveTurnRecord, updateTurnRecordFollowUp } from '../services/turnRecordsService.js';

const TURN_OPTIONS = ['09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30'];
const MONTH_NAMES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const EMPTY_COUNTS = {
  standardCount: 0,
  fullPassCount: 0,
  kidsCount: 0,
  premiumKidsCount: 0,
  fullDayCount: 0,
  yakutoboganCount: 0,
};
const COUNTERS = [
  { key: 'standardCount', label: 'Standard', helper: 'Pulsera regular' },
  { key: 'fullPassCount', label: 'Full Pass', helper: 'Incluye beneficio de foto' },
  { key: 'kidsCount', label: 'Kids', helper: 'Ingreso infantil' },
  { key: 'premiumKidsCount', label: 'Premium Kids', helper: 'Experiencia infantil premium' },
  { key: 'fullDayCount', label: 'Full Day', helper: 'Pase de dia completo' },
  { key: 'yakutoboganCount', label: 'Yakutobogan', helper: 'Acceso a tobogan' },
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

function formatDateLabel(dateValue) {
  if (!dateValue) return 'Fecha sin definir';
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return dateValue;
  return new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(year, month - 1, day));
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
  const groupsPurchasedExtraPhotos = records.filter((record) => recordBoolean(record, 'purchasedExtraPhotos', 'purchased_extra_photos')).length;
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
  const code = String(record?.photoCode || record?.photo_code || '').trim() || 'tu código de fotos';
  if (recordBoolean(record, 'freePhotoRedeemed', 'free_photo_redeemed')) {
    return `Hola, somos Yakupark. Te escribimos para hacer seguimiento de la foto gratis incluida en tu Full Pass. Si querés revisar más posibles fotos o elegir tus favoritas, podés usar tu código: ${code}.`;
  }
  return `Hola, somos Yakupark. Te escribimos por la foto gratis incluida en tu Full Pass. Podés revisar tus fotos con este código: ${code}. Si querés, también podemos ayudarte a elegir tus fotos favoritas.`;
}

function buildTurnWhatsappUrl(record) {
  const number = normalizeWhatsappForLink(recordText(record, 'customerWhatsapp', 'customer_whatsapp'));
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(buildTurnWhatsappMessage(record))}`;
}

export default function RegistroTurno() {
  const today = useMemo(() => localDateValue(), []);
  const [date, setDate] = useState(today);
  const [turnTime, setTurnTime] = useState(TURN_OPTIONS[0]);
  const [photoCode, setPhotoCode] = useState(() => createPhotoCode(today, TURN_OPTIONS[0]));
  const [photoCodeTouched, setPhotoCodeTouched] = useState(false);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [totalPeople, setTotalPeople] = useState(0);
  const [totalTouched, setTotalTouched] = useState(false);
  const [freePhotoRedeemed, setFreePhotoRedeemed] = useState(false);
  const [purchasedExtraPhotos, setPurchasedExtraPhotos] = useState(false);
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [notes, setNotes] = useState('');
  const [records, setRecords] = useState([]);
  const [lastRecord, setLastRecord] = useState(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('success');
  const [recordsStorage, setRecordsStorage] = useState('localStorage');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [followUpRecord, setFollowUpRecord] = useState(null);
  const [followUpForm, setFollowUpForm] = useState({ freePhotoRedeemed: false, purchasedExtraPhotos: false, customerWhatsapp: '', notes: '' });
  const [isUpdatingFollowUp, setIsUpdatingFollowUp] = useState(false);
  const [followUpStatus, setFollowUpStatus] = useState({ tone: 'success', text: '' });

  const calculatedPeople = useMemo(() => Object.values(counts).reduce((sum, value) => sum + numberValue(value), 0), [counts]);
  const hasFreePhotoBenefit = counts.fullPassCount > 0;

  useEffect(() => {
    if (!photoCodeTouched) setPhotoCode(createPhotoCode(date, turnTime));
  }, [date, turnTime, photoCodeTouched]);

  useEffect(() => {
    if (!totalTouched) setTotalPeople(calculatedPeople);
  }, [calculatedPeople, totalTouched]);

  useEffect(() => {
    if (!hasFreePhotoBenefit) {
      setFreePhotoRedeemed(false);
      setCustomerWhatsapp('');
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

  const selectedDateSummary = useMemo(() => {
    const people = records.reduce((sum, record) => sum + recordNumber(record, 'totalPeople', 'total_people'), 0);
    const fullPass = records.reduce((sum, record) => sum + recordNumber(record, 'fullPassCount', 'full_pass_count'), 0);
    const benefitGroups = records.filter((record) => recordBoolean(record, 'hasFreePhotoBenefit', 'has_free_photo_benefit')).length;
    const redeemed = records.filter((record) => recordBoolean(record, 'freePhotoRedeemed', 'free_photo_redeemed')).length;
    const extraPhotos = records.filter((record) => recordBoolean(record, 'purchasedExtraPhotos', 'purchased_extra_photos')).length;
    const whatsappRecords = records.filter((record) => recordText(record, 'customerWhatsapp', 'customer_whatsapp')).length;
    const fullPassRate = percentValue(fullPass, people);
    return { people, fullPass, benefitGroups, redeemed, extraPhotos, whatsappRecords, fullPassRate };
  }, [records]);

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
  };

  const updateCount = (key, delta) => {
    setMessage('');
    setCounts((current) => ({
      ...current,
      [key]: Math.max(0, numberValue(current[key]) + delta),
    }));
  };

  const handleTotalChange = (event) => {
    setTotalTouched(true);
    setTotalPeople(numberValue(event.target.value));
  };

  const useCalculatedTotal = () => {
    setTotalTouched(false);
    setTotalPeople(calculatedPeople);
  };

  const openFollowUp = (record) => {
    const canUseWhatsapp = record.hasFreePhotoBenefit || record.fullPassCount > 0;
    setFollowUpRecord(record);
    setFollowUpForm({
      freePhotoRedeemed: Boolean(record.freePhotoRedeemed),
      purchasedExtraPhotos: Boolean(record.purchasedExtraPhotos),
      customerWhatsapp: canUseWhatsapp ? (record.customerWhatsapp || '') : '',
      notes: record.notes || '',
    });
    setFollowUpStatus({ tone: 'success', text: '' });
  };

  const closeFollowUp = () => {
    if (isUpdatingFollowUp) return;
    setFollowUpRecord(null);
    setFollowUpStatus({ tone: 'success', text: '' });
  };

  const updateFollowUpField = (key, value) => {
    setFollowUpStatus({ tone: 'success', text: '' });
    setFollowUpForm((current) => ({ ...current, [key]: value }));
  };

  const submitFollowUp = async (event) => {
    event.preventDefault();
    if (!followUpRecord?.id) return;
    setIsUpdatingFollowUp(true);
    setFollowUpStatus({ tone: 'success', text: '' });
    const canUseWhatsapp = followUpRecord.hasFreePhotoBenefit || followUpRecord.fullPassCount > 0;
    const result = await updateTurnRecordFollowUp(followUpRecord.id, {
      freePhotoRedeemed: followUpForm.freePhotoRedeemed,
      purchasedExtraPhotos: followUpForm.purchasedExtraPhotos,
      customerWhatsapp: canUseWhatsapp ? followUpForm.customerWhatsapp : '',
      notes: followUpForm.notes,
    });

    if (result.ok) {
      setFollowUpStatus({ tone: 'success', text: 'Seguimiento actualizado.' });
      setMessageTone(result.storage === 'supabase' ? 'success' : 'warning');
      setMessage(result.storage === 'supabase' ? 'Seguimiento actualizado.' : 'Seguimiento actualizado en este dispositivo.');
      const refreshed = await listTurnRecordsByDate(date);
      if (refreshed.ok) {
        setRecords(refreshed.data);
        setRecordsStorage(refreshed.storage);
      } else {
        setRecords((current) => current.map((item) => (item.id === result.data.id ? result.data : item)));
      }
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
    setIsSaving(true);
    setMessage('');
    const safeFullPassCount = numberValue(counts.fullPassCount);
    const safeHasFreePhotoBenefit = safeFullPassCount > 0;
    const safeTotalPeople = Math.max(numberValue(totalPeople), calculatedPeople);
    const safeCustomerWhatsapp = safeHasFreePhotoBenefit ? normalizeCustomerWhatsapp(customerWhatsapp) : '';
    const record = {
      id: buildId(),
      date,
      turnTime,
      photoCode: (photoCode.trim() || createPhotoCode(date, turnTime)).toUpperCase(),
      totalPeople: safeTotalPeople,
      standardCount: numberValue(counts.standardCount),
      fullPassCount: safeFullPassCount,
      kidsCount: numberValue(counts.kidsCount),
      premiumKidsCount: numberValue(counts.premiumKidsCount),
      fullDayCount: numberValue(counts.fullDayCount),
      yakutoboganCount: numberValue(counts.yakutoboganCount),
      hasFreePhotoBenefit: safeHasFreePhotoBenefit,
      freePhotoRedeemed: safeHasFreePhotoBenefit ? freePhotoRedeemed : false,
      purchasedExtraPhotos,
      customerWhatsapp: safeCustomerWhatsapp,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };

    const result = await saveTurnRecord(record);
    if (result.ok) {
      setLastRecord(result.data);
      setMessageTone(result.storage === 'supabase' ? 'success' : 'warning');
      setMessage(result.storage === 'supabase' ? 'Registro guardado en la nube.' : 'Registro guardado en este dispositivo. La nube todavía no está disponible.');
      const refreshed = await listTurnRecordsByDate(date);
      if (refreshed.ok) {
        setRecords(refreshed.data);
        setRecordsStorage(refreshed.storage);
      } else {
        setRecords((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
      }
      setCounts(EMPTY_COUNTS);
      setNotes('');
      setFreePhotoRedeemed(false);
      setPurchasedExtraPhotos(false);
      setCustomerWhatsapp('');
      setTotalTouched(false);
      setTotalPeople(0);
      setPhotoCodeTouched(false);
      setPhotoCode(createPhotoCode(date, turnTime));
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
          <h1>Registro de grupos por turno</h1>
          <p>
            Registrá Full Pass, foto gratis y posibles compras de fotos antes del ingreso.
          </p>
        </div>
        <div className="turn-register-privacy">
          <strong>Solo datos operativos</strong>
          <span>No se guardan DNI, nombres completos, selfies ni datos faciales.</span>
        </div>
      </section>

      <section className="turn-register-layout">
        <form className="turn-register-card turn-register-form" onSubmit={saveRecord}>
          <div className="turn-register-card-head">
            <span>Nuevo grupo</span>
            <h2>Datos del turno</h2>
          </div>

          <div className="turn-register-fields">
            <label>
              <span>Fecha</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label>
              <span>Horario</span>
              <select value={turnTime} onChange={(event) => setTurnTime(event.target.value)}>
                {TURN_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              <span>Código de fotos sugerido</span>
              <input
                type="text"
                value={photoCode}
                onChange={(event) => {
                  setPhotoCodeTouched(true);
                  setPhotoCode(event.target.value.toUpperCase());
                }}
                placeholder="05JUNIO-1030"
              />
            </label>
            <label>
              <span>Total de personas</span>
              <input type="number" min="0" value={totalPeople} onChange={handleTotalChange} />
            </label>
          </div>

          <div className="turn-calculated-total">
            <span>Total calculado desde contadores: <strong>{calculatedPeople}</strong></span>
            {totalTouched && totalPeople !== calculatedPeople && (
              <button type="button" onClick={useCalculatedTotal}>Usar calculado</button>
            )}
          </div>

          <div className="turn-counter-grid" aria-label="Contadores por tipo de entrada">
            {COUNTERS.map((counter) => (
              <div className="turn-counter-control" key={counter.key}>
                <div>
                  <strong>{counter.label}</strong>
                  <span>{counter.helper}</span>
                </div>
                <div className="turn-counter-actions">
                  <button type="button" onClick={() => updateCount(counter.key, -1)} aria-label={`Restar ${counter.label}`}>-</button>
                  <b>{counts[counter.key]}</b>
                  <button type="button" onClick={() => updateCount(counter.key, 1)} aria-label={`Sumar ${counter.label}`}>+</button>
                </div>
              </div>
            ))}
          </div>

          <div className={`turn-benefit-card ${hasFreePhotoBenefit ? 'active' : ''}`}>
            <span>Beneficio foto gratis</span>
            <strong>{hasFreePhotoBenefit ? 'Sí aplica' : 'No aplica todavía'}</strong>
            <p>Se marca automáticamente cuando el grupo tiene al menos un Full Pass.</p>
            {hasFreePhotoBenefit && <em>Foto gratis incluida</em>}
          </div>

          {hasFreePhotoBenefit && (
            <label className="turn-whatsapp-field">
              <span>WhatsApp para foto gratis</span>
              <input
                type="tel"
                value={customerWhatsapp}
                onChange={(event) => setCustomerWhatsapp(event.target.value)}
                placeholder="Ej. 999 999 999"
                inputMode="tel"
              />
              <small>Opcional. Se usará solo para coordinar la foto gratis incluida en el Full Pass.</small>
            </label>
          )}

          <p className="turn-privacy-note">No pedimos DNI, nombres completos, selfies ni datos faciales en este registro.</p>

          <div className="turn-commercial-switches">
            <label className={!hasFreePhotoBenefit ? 'disabled' : ''}>
              <input
                type="checkbox"
                checked={freePhotoRedeemed}
                disabled={!hasFreePhotoBenefit}
                onChange={(event) => setFreePhotoRedeemed(event.target.checked)}
              />
              <span>Foto gratis usada</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={purchasedExtraPhotos}
                onChange={(event) => setPurchasedExtraPhotos(event.target.checked)}
              />
              <span>Compró fotos extra</span>
            </label>
          </div>

          <label className="turn-notes-field">
            <span>Notas opcionales</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows="3"
              placeholder="Ej: familia grande, vuelve por fotos, grupo escolar, observaciones de caja..."
            />
          </label>

          <button className="turn-register-submit" type="submit" disabled={isSaving}>
            {isSaving ? 'Guardando registro...' : 'Guardar registro del turno'}
          </button>
          {message && <p className={`turn-register-message ${messageTone}`} role="status">{message}</p>}
        </form>

        <aside className="turn-register-stack">
          <section className="turn-register-card turn-summary-card">
            <span>{formatDateLabel(date)}</span>
            <h2>Resumen de la fecha</h2>
            <div className="turn-summary-grid">
              <div><strong>{selectedDateSummary.people}</strong><span>Personas registradas</span></div>
              <div><strong>{selectedDateSummary.fullPass}</strong><span>Full Pass</span></div>
              <div><strong>{selectedDateSummary.benefitGroups}</strong><span>Grupos con beneficio</span></div>
              <div><strong>{selectedDateSummary.fullPassRate}%</strong><span>Full Pass / personas</span></div>
              <div><strong>{selectedDateSummary.redeemed}</strong><span>Fotos gratis usadas</span></div>
              <div><strong>{selectedDateSummary.extraPhotos}</strong><span>Compraron fotos extra</span></div>
              <div><strong>{selectedDateSummary.whatsappRecords}</strong><span>WhatsApp registrados</span></div>
            </div>
          </section>

          {lastRecord && (
            <section className="turn-register-card turn-last-record">
              <span>Último registro</span>
              <strong>{lastRecord.photoCode}</strong>
              <p>{lastRecord.totalPeople} personas · {lastRecord.fullPassCount} Full Pass · Foto gratis: {lastRecord.hasFreePhotoBenefit ? 'Sí' : 'No'}</p>
              <p className="turn-contact-badge">WhatsApp: {lastRecord.customerWhatsapp ? `Registrado ${maskCustomerWhatsapp(lastRecord.customerWhatsapp)}` : 'Sin registrar'}</p>
              <div className="turn-record-badges">
                <span>{lastRecord.storage === 'supabase' ? 'Nube' : 'Este dispositivo'}</span>
                {lastRecord.freePhotoRedeemed && <span>Foto gratis usada</span>}
                {lastRecord.purchasedExtraPhotos && <span>Compró fotos extra</span>}
                <span>{lastRecord.customerWhatsapp ? 'WhatsApp registrado' : 'Sin WhatsApp'}</span>
              </div>
            </section>
          )}
        </aside>
      </section>

      <section className="turn-register-card turn-commercial-summary">
        <div className="turn-register-card-head">
          <span>Medición comercial</span>
          <h2>Resumen comercial del día</h2>
          <p>Medí cuántos Full Pass entraron por la foto gratis y cuántos avanzaron a compra de fotos.</p>
        </div>

        {commercialSummary.totalGroups ? (
          <>
            <div className="turn-summary-grid">
              <div className="turn-summary-metric">
                <strong className="turn-summary-value">{commercialSummary.totalGroups}</strong>
                <span className="turn-summary-label">Grupos registrados</span>
                <small className="turn-summary-helper">Registros cargados para esta fecha.</small>
              </div>
              <div className="turn-summary-metric">
                <strong className="turn-summary-value">{commercialSummary.totalPeople}</strong>
                <span className="turn-summary-label">Personas registradas</span>
                <small className="turn-summary-helper">Suma del total de personas por grupo.</small>
              </div>
              <div className="turn-summary-metric">
                <strong className="turn-summary-value">{commercialSummary.totalFullPass}</strong>
                <span className="turn-summary-label">Full Pass</span>
                <small className="turn-summary-helper">Full Pass representa el {commercialSummary.fullPassRate}% de las personas registradas hoy.</small>
              </div>
              <div className="turn-summary-metric">
                <strong className="turn-summary-value">{commercialSummary.fullPassRate}%</strong>
                <span className="turn-summary-label">Conversión Full Pass</span>
                <small className="turn-summary-helper">Full Pass sobre personas registradas.</small>
              </div>
              <div className="turn-summary-metric">
                <strong className="turn-summary-value">{commercialSummary.groupsWithFreePhotoBenefit}</strong>
                <span className="turn-summary-label">Grupos con foto gratis</span>
                <small className="turn-summary-helper">Grupos con beneficio incluido por Full Pass.</small>
              </div>
              <div className="turn-summary-metric">
                <strong className="turn-summary-value">{commercialSummary.groupsWithWhatsapp}</strong>
                <span className="turn-summary-label">WhatsApp registrados</span>
                <small className="turn-summary-helper">{commercialSummary.groupsWithWhatsapp} grupos dejaron WhatsApp para coordinar la foto gratis.</small>
              </div>
              <div className="turn-summary-metric">
                <strong className="turn-summary-value">{commercialSummary.freePhotosRedeemed}</strong>
                <span className="turn-summary-label">Fotos gratis usadas</span>
                <small className="turn-summary-helper">Beneficios marcados como usados por el staff.</small>
              </div>
              <div className="turn-summary-metric">
                <strong className="turn-summary-value">{commercialSummary.groupsPurchasedExtraPhotos}</strong>
                <span className="turn-summary-label">Compraron fotos extra</span>
                <small className="turn-summary-helper">{commercialSummary.groupsPurchasedExtraPhotos} grupos compraron fotos extra después del beneficio.</small>
              </div>
              <div className="turn-summary-metric featured">
                <strong className="turn-summary-value">{commercialSummary.extraPhotoConversion}%</strong>
                <span className="turn-summary-label">Conversión a fotos extra</span>
                <small className="turn-summary-helper">Compras extra sobre grupos con foto gratis.</small>
              </div>
            </div>
          </>
        ) : (
          <p className="turn-summary-empty">Todavía no hay registros para esta fecha.</p>
        )}
      </section>

      <section className="turn-register-card turn-records-section">
        <div className="turn-records-header">
          <div className="turn-register-card-head">
            <span>Registros guardados</span>
            <h2>Turnos de la fecha seleccionada</h2>
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
                <div>
                  <span>{record.turnTime}</span>
                  <strong>{record.photoCode}</strong>
                  <small>{record.notes || 'Sin notas'}</small>
                  {record.customerWhatsapp && <small className="turn-contact-badge">WhatsApp: registrado {maskCustomerWhatsapp(record.customerWhatsapp)}</small>}
                  <div className="turn-record-badges">
                    <span>{record.storage === 'supabase' ? 'Nube' : 'Este dispositivo'}</span>
                    {record.hasFreePhotoBenefit && <span>Foto gratis incluida</span>}
                    {record.freePhotoRedeemed && <span>Foto gratis usada</span>}
                    {record.purchasedExtraPhotos && <span>Compró fotos extra</span>}
                    <span>{record.customerWhatsapp ? 'WhatsApp registrado' : 'Sin WhatsApp'}</span>
                  </div>
                </div>
                <dl>
                  <div><dt>Personas</dt><dd>{record.totalPeople}</dd></div>
                  <div><dt>Full Pass</dt><dd>{record.fullPassCount}</dd></div>
                  <div><dt>Foto gratis</dt><dd>{record.hasFreePhotoBenefit ? 'Sí' : 'No'}</dd></div>
                  <div><dt>WhatsApp</dt><dd>{record.customerWhatsapp ? 'Registrado' : 'Sin registrar'}</dd></div>
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
                        Enviar WhatsApp
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

      {followUpRecord && (
        <div className="turn-followup-modal" role="dialog" aria-modal="true" aria-label="Actualizar seguimiento comercial">
          <form className="turn-followup-panel" onSubmit={submitFollowUp}>
            <div className="turn-register-card-head">
              <span>Seguimiento comercial</span>
              <h2>Actualizar seguimiento</h2>
              <p>{followUpRecord.photoCode} · {followUpRecord.turnTime}</p>
            </div>

            <div className="turn-followup-options">
              <label>
                <input
                  type="checkbox"
                  checked={followUpForm.freePhotoRedeemed}
                  onChange={(event) => updateFollowUpField('freePhotoRedeemed', event.target.checked)}
                />
                <span>Foto gratis usada</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={followUpForm.purchasedExtraPhotos}
                  onChange={(event) => updateFollowUpField('purchasedExtraPhotos', event.target.checked)}
                />
                <span>Compró fotos extra</span>
              </label>
            </div>

            {(followUpRecord.hasFreePhotoBenefit || followUpRecord.fullPassCount > 0) ? (
              <label className="turn-followup-field">
                <span>WhatsApp para foto gratis</span>
                <input
                  type="tel"
                  value={followUpForm.customerWhatsapp}
                  onChange={(event) => updateFollowUpField('customerWhatsapp', event.target.value)}
                  placeholder="Ej. 999 999 999"
                  inputMode="tel"
                />
                <small>Opcional. Visible solo al editar el seguimiento del registro.</small>
              </label>
            ) : (
              <p className="turn-followup-status">Este grupo no tiene beneficio de foto gratis, por eso no se registra WhatsApp.</p>
            )}

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