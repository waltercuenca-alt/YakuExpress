import React, { useEffect, useMemo, useState } from 'react';
import { listTurnRecordsByDate, saveTurnRecord } from '../services/turnRecordsService.js';

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
  const [notes, setNotes] = useState('');
  const [records, setRecords] = useState([]);
  const [lastRecord, setLastRecord] = useState(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('success');
  const [recordsStorage, setRecordsStorage] = useState('localStorage');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  const calculatedPeople = useMemo(() => Object.values(counts).reduce((sum, value) => sum + numberValue(value), 0), [counts]);
  const hasFreePhotoBenefit = counts.fullPassCount > 0;

  useEffect(() => {
    if (!photoCodeTouched) setPhotoCode(createPhotoCode(date, turnTime));
  }, [date, turnTime, photoCodeTouched]);

  useEffect(() => {
    if (!totalTouched) setTotalPeople(calculatedPeople);
  }, [calculatedPeople, totalTouched]);

  useEffect(() => {
    if (!hasFreePhotoBenefit) setFreePhotoRedeemed(false);
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
    const people = records.reduce((sum, record) => sum + numberValue(record.totalPeople), 0);
    const fullPass = records.reduce((sum, record) => sum + numberValue(record.fullPassCount), 0);
    const benefitGroups = records.filter((record) => record.hasFreePhotoBenefit).length;
    const redeemed = records.filter((record) => record.freePhotoRedeemed).length;
    const extraPhotos = records.filter((record) => record.purchasedExtraPhotos).length;
    const fullPassRate = people ? Math.round((fullPass / people) * 100) : 0;
    return { people, fullPass, benefitGroups, redeemed, extraPhotos, fullPassRate };
  }, [records]);

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

  const saveRecord = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage('');
    const safeFullPassCount = numberValue(counts.fullPassCount);
    const safeHasFreePhotoBenefit = safeFullPassCount > 0;
    const safeTotalPeople = Math.max(numberValue(totalPeople), calculatedPeople);
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
            </div>
          </section>

          {lastRecord && (
            <section className="turn-register-card turn-last-record">
              <span>Último registro</span>
              <strong>{lastRecord.photoCode}</strong>
              <p>{lastRecord.totalPeople} personas · {lastRecord.fullPassCount} Full Pass · Foto gratis: {lastRecord.hasFreePhotoBenefit ? 'Sí' : 'No'}</p>
              <div className="turn-record-badges">
                <span>{lastRecord.storage === 'supabase' ? 'Nube' : 'Este dispositivo'}</span>
                {lastRecord.freePhotoRedeemed && <span>Foto gratis usada</span>}
                {lastRecord.purchasedExtraPhotos && <span>Compró fotos extra</span>}
              </div>
            </section>
          )}
        </aside>
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
                  <div className="turn-record-badges">
                    <span>{record.storage === 'supabase' ? 'Nube' : 'Este dispositivo'}</span>
                    {record.hasFreePhotoBenefit && <span>Foto gratis incluida</span>}
                    {record.freePhotoRedeemed && <span>Foto gratis usada</span>}
                    {record.purchasedExtraPhotos && <span>Compró fotos extra</span>}
                  </div>
                </div>
                <dl>
                  <div><dt>Personas</dt><dd>{record.totalPeople}</dd></div>
                  <div><dt>Full Pass</dt><dd>{record.fullPassCount}</dd></div>
                  <div><dt>Foto gratis</dt><dd>{record.hasFreePhotoBenefit ? 'Sí' : 'No'}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className="turn-record-empty">Todavía no hay grupos guardados para esta fecha.</p>
        )}
      </section>
    </main>
  );
}