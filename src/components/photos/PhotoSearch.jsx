import React, { useMemo, useState } from 'react';

export default function PhotoSearch({ code, setCode, loading, onSubmit, onGroupSearch }) {
  const [dayCode, setDayCode] = useState('');
  const [groupCode, setGroupCode] = useState('');

  const combinedCode = useMemo(
    () => buildGroupCode(dayCode, groupCode),
    [dayCode, groupCode],
  );

  const submitGroupSearch = (event) => {
    event.preventDefault();
    if (!combinedCode) return;
    onGroupSearch?.(combinedCode);
  };

  return (
    <section className="photos-search-stack" aria-label="Busqueda de fotos">
      <form className="photos-search photos-group-search" onSubmit={submitGroupSearch}>
        <span>Encontra tus fotos mas rapido</span>
        <p>Ingresa el dia y tu codigo de grupo para ver solo tus fotos.</p>
        <div className="photos-group-fields">
          <label htmlFor="photo-day-code">
            Dia
            <input
              id="photo-day-code"
              value={dayCode}
              onChange={(event) => setDayCode(event.target.value.toUpperCase())}
              placeholder="23MAYO"
              autoComplete="off"
            />
          </label>
          <label htmlFor="photo-group-code">
            Grupo
            <input
              id="photo-group-code"
              value={groupCode}
              onChange={(event) => setGroupCode(event.target.value.toUpperCase())}
              placeholder="01"
              autoComplete="off"
              inputMode="numeric"
            />
          </label>
        </div>
        <small>
          Resultado: <b>{combinedCode || '23MAYO01'}</b>
        </small>
        <button type="submit" disabled={loading || !combinedCode}>
          {loading ? 'Buscando...' : 'Buscar mis fotos'}
        </button>
      </form>

      <details className="photos-manual-details">
        <summary>Busqueda manual por carpeta</summary>
        <form className="photos-search photos-manual-search" onSubmit={onSubmit}>
          <label htmlFor="photo-code">Carpeta Cloudinary</label>
          <div>
            <input
              id="photo-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="23MAYO01"
              autoComplete="off"
            />
            <button type="submit" disabled={loading || !code.trim()}>
              {loading ? 'Buscando...' : 'Ver fotos'}
            </button>
          </div>
          <small>Tambien puedes escribir la carpeta completa, por ejemplo 23MAYO01.</small>
        </form>
      </details>
    </section>
  );
}

function buildGroupCode(dayCode, groupCode) {
  const day = normalizePhotoCode(dayCode);
  const group = normalizePhotoCode(groupCode);
  if (!day) return '';
  if (!group) return day;
  const normalizedGroup = /^\d+$/.test(group) ? group.padStart(2, '0') : group;
  return `${day}${normalizedGroup}`;
}

function normalizePhotoCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
