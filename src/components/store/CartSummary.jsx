import React from 'react';

export default function CartSummary({ items, total, onCheckout, busy, error }) {
  return (
    <aside className="store-cart">
      <div>
        <span>Carrito YakuPark</span>
        <h2>Tu pedido</h2>
      </div>
      {items.length ? (
        <div className="store-cart-list">
          {items.map((item) => (
            <div key={item.product.id}>
              <span>{item.quantity} x {item.product.name}</span>
              <strong>S/{item.subtotal}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p>Elige tus productos favoritos para llevar la aventura contigo.</p>
      )}
      <div className="store-cart-total">
        <span>Total</span>
        <strong>S/{total}</strong>
      </div>
      {error && <p className="store-error">{error}</p>}
      <button type="button" onClick={onCheckout} disabled={!items.length || busy}>
        {busy ? 'Generando pedido...' : 'Generar pedido'}
      </button>
    </aside>
  );
}
