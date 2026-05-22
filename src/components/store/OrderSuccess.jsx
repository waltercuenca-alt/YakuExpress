import React from 'react';

export default function OrderSuccess({ order, onNewOrder }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(order.code)}`;
  return (
    <main className="store-shell">
      <section className="store-success">
        <span className="store-success-check">OK</span>
        <p>Pedido generado</p>
        <h1>{order.code}</h1>
        <span>Muestra este código en caja para retirar tus productos</span>
        <div className="store-success-layout">
          <div className="store-success-qr">
            <img src={qrUrl} alt={`QR del pedido ${order.code}`} width="320" height="320" />
          </div>
          <div className="store-success-summary">
            <h2>Resumen</h2>
            {order.items.map((item) => (
              <div key={item.product.id}>
                <span>{item.quantity} x {item.product.name}</span>
                <strong>S/{item.subtotal}</strong>
              </div>
            ))}
            <b>Total: S/{order.total}</b>
          </div>
        </div>
        <button type="button" onClick={onNewOrder}>Crear otro pedido</button>
      </section>
    </main>
  );
}
