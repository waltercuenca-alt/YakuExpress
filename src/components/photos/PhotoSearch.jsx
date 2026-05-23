import React from 'react';

export default function PhotoSearch({ code, setCode, loading, onSubmit }) {
  return (
    <form className="photos-search" onSubmit={onSubmit}>
      <label htmlFor="photo-code">Ingresa tu codigo</label>
      <div>
        <input
          id="photo-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="YAKU-2044"
          autoComplete="off"
        />
        <button type="submit" disabled={loading || !code.trim()}>
          {loading ? 'Buscando...' : 'Ver mis fotos'}
        </button>
      </div>
      <small>Ejemplo: ABC123 o YAKU-2044</small>
    </form>
  );
}
