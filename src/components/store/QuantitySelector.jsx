import React from 'react';

export default function QuantitySelector({ value, onChange }) {
  const quantity = Math.max(0, Number(value) || 0);
  return (
    <div className="store-quantity" aria-label="Selector de cantidad">
      <button type="button" onClick={() => onChange(Math.max(0, quantity - 1))} disabled={quantity <= 0}>-</button>
      <strong>{quantity}</strong>
      <button type="button" onClick={() => onChange(quantity + 1)}>+</button>
    </div>
  );
}
