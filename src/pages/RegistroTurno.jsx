import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'yaku_turn_records_v1';
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

function readRecords() {
  if (typeof window === 'undefined') return [];
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(records) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
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
  const [notes, setNotes] = useState('');
  const [records, setRecords] = useState([]);
  const [lastRecord, setLastRecord] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setRecords(readRecords());
  }, []);

  useEffect(() => {
    if (!photoCodeTouched) setPhotoCode(createPhotoCode(date, turnTime));
  }, [date, turnTime, photoCodeTouched]);

  const calculatedPeople = useMemo(() => Object.values(counts).reduce((sum, value) => sum + numberValue(value), 0), [counts]);
  const hasFreePhotoBenefit = counts.fullPassCount > 0;

  useEffect(() => {
    if (!totalTouched) setTotalPeople(calculatedPeople);
  }, [calculatedPeople, totalTouched]);

  const selectedDateRecords = useMemo(() => records.filter((record) => record.date === date), [records, date]);
  const selectedDateSummary = useMemo(() => {
    const people = selectedDateRecords.reduce((sum, record) => sum + numberValue(record.totalPeople), 0);
    const fullPass = selectedDateRecords.reduce((sum, record) => sum + numberValue(record.fullPassCount), 0);
    const benefitGroups = selectedDateRecords.filter((record) => record.hasFreePhotoBenefit).length;
    const fullPassRate = people ? Math.round((fullPass / people) * 100) : 0;
    return { people, fullPass, benefitGroups, fullPassRate };
  }, [selectedDateRecords]);

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

  const saveRecord = (event) => {
    event.preventDefault();
    const record = {
      id: buildId(),
      date,
      turnTime,
      photoCode: photoCode.trim() || createPhotoCode(date, turnTime),
      totalPeople: numberValue(totalPeople),
      standardCount: numberValue(counts.standardCount),
      fullPassCount: numberValue(counts.fullPassCount),
      kidsCount: numberValue(counts.kidsCount),
      premiumKidsCount: numberValue(counts.premiumKidsCount),
      fullDayCount: numberValue(counts.fullDayCount),
      yakutoboganCount: numberValue(counts.yakutoboganCount),
      hasFreePhotoBenefit,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };
    const nextRecords = [record, ...readRecords()];
    writeRecords(nextRecords);
    setRecords(nextRecords);
    setLastRecord(record);
    setMessage('Registro guardado correctamente.');
    setCounts(EMPTY_COUNTS);
    setNotes('');
    setTotalTouched(false);
    setTotalPeople(0);
    setPhotoCodeTouched(false);
    setPhotoCode(createPhotoCode(date, turnTime));
  };

  return (
    <main className="turn-register-page">
      <section className="turn-register-hero">
        <div>
          <span className="turn-register-kicker">YakuExpress interno</span>
          <h1>Registro simple de grupos por turno</h1>
          <p>
            Medí cuántas personas entran por horario, cuántos usan Full Pass y qué grupos tienen beneficio de foto gratis.
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

          <button className="turn-register-submit" type="submit">Guardar registro del turno</button>
          {message && <p className="turn-register-message" role="status">{message}</p>}
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
            </div>
          </section>

          {lastRecord && (
            <section className="turn-register-card turn-last-record">
              <span>Último registro</span>
              <strong>{lastRecord.photoCode}</strong>
              <p>{lastRecord.totalPeople} personas · {lastRecord.fullPassCount} Full Pass · Foto gratis: {lastRecord.hasFreePhotoBenefit ? 'Sí' : 'No'}</p>
            </section>
          )}
        </aside>
      </section>

      <section className="turn-register-card turn-records-section">
        <div className="turn-register-card-head">
          <span>Registros guardados</span>
          <h2>Turnos de la fecha seleccionada</h2>
        </div>
        {selectedDateRecords.length ? (
          <div className="turn-record-list">
            {selectedDateRecords.map((record) => (
              <article className="turn-record-item" key={record.id}>
                <div>
                  <span>{record.turnTime}</span>
                  <strong>{record.photoCode}</strong>
                  <small>{record.notes || 'Sin notas'}</small>
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