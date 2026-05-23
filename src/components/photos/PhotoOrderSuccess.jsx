import React from 'react';

export default function PhotoOrderSuccess({ order, onBack }) {
  const orderCode = order.order_code || order.code;
  const clientCode = order.client_code || order.customer_code;
  const total = order.total_amount ?? order.total;
  const qrValue = orderCode;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrValue)}`;

  return (
    <main className="photos-shell">
      <section className="photo-success">
        <span>Pedido generado</span>
        <h1>{orderCode}</h1>
        <p>Muestra este codigo en caja para buscar tus fotos y completar la compra.</p>
        <div className="photo-success-layout">
          <div className="photo-success-qr">
            <img src={qrUrl} alt={`QR pedido ${orderCode}`} />
          </div>
          <div className="photo-success-summary">
            <small>Codigo cliente</small>
            <strong>{clientCode}</strong>
            <small>Fotos</small>
            <strong>{order.items.map((photo) => `#${photo.number}`).join(', ')}</strong>
            <small>Total</small>
            <strong>{formatTotal(total)}</strong>
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
