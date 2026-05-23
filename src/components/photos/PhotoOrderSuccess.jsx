import React from 'react';

export default function PhotoOrderSuccess({ order, onBack }) {
  const qrValue = order.code;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrValue)}`;

  return (
    <main className="photos-shell">
      <section className="photo-success">
        <span>Pedido generado</span>
        <h1>{order.code}</h1>
        <p>Muestra este codigo en caja para buscar tus fotos y completar la compra.</p>
        <div className="photo-success-layout">
          <div className="photo-success-qr">
            <img src={qrUrl} alt={`QR pedido ${order.code}`} />
          </div>
          <div className="photo-success-summary">
            <small>Codigo cliente</small>
            <strong>{order.customer_code}</strong>
            <small>Fotos</small>
            <strong>{order.items.map((photo) => `#${photo.number}`).join(', ')}</strong>
            <small>Total</small>
            <strong>{formatTotal(order.total)}</strong>
          </div>
        </div>
        <button type="button" onClick={onBack}>Elegir otras fotos</button>
      </section>
    </main>
  );
}

function formatTotal(total) {
  return Number(total) === 0 ? 'Gratis' : `S/${Number(total)}`;
}
