import React, { useState } from 'react';

export default function PhotoSummaryModal({ customerCode, photos, packageInfo, creating, error, onClose, onConfirm }) {
  const [whatsapp, setWhatsapp] = useState('');
  const normalizedWhatsapp = whatsapp.replace(/\D/g, '');

  return (
    <div className="photo-summary-backdrop" role="dialog" aria-modal="true" aria-label="Resumen del pedido">
      <section className="photo-summary-modal">
        <button className="photo-modal-close" type="button" onClick={onClose} aria-label="Cerrar resumen">×</button>
        <span>Resumen del pedido</span>
        <h2>{customerCode}</h2>
        <div className="photo-summary-grid">
          <div>
            <small>Fotos seleccionadas</small>
            <strong>{photos.map((photo) => `#${photo.number}`).join(', ')}</strong>
          </div>
          <div>
            <small>Cantidad</small>
            <strong>{photos.length}</strong>
          </div>
          <div>
            <small>Total</small>
            <strong>{packageInfo.displayTotal}</strong>
          </div>
        </div>
        <label className="photo-whatsapp-field">
          <span>WhatsApp para recibir tu link privado</span>
          <input
            type="tel"
            inputMode="tel"
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            placeholder="Ejemplo: 51987654321"
          />
        </label>
        {error && <p className="photo-summary-error">{error}</p>}
        <button className="photo-confirm-button" type="button" onClick={() => onConfirm(normalizedWhatsapp)} disabled={creating || normalizedWhatsapp.length < 8}>
          {creating ? 'Generando pedido...' : 'Generar codigo de compra'}
        </button>
      </section>
    </div>
  );
}
