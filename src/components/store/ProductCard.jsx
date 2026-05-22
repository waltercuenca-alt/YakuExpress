import React from 'react';
import QuantitySelector from './QuantitySelector.jsx';

export default function ProductCard({ product, quantity, unitPrice, subtotal, onQuantityChange, onAdd }) {
  const fallbackImage = product.placeholder_image_url;

  return (
    <article className={`store-product-card ${product.featured ? 'featured' : ''}`}>
      {product.badge && <span className="store-product-badge">{product.badge}</span>}
      <div className="store-product-image">
        <img
          src={product.image_url || fallbackImage}
          alt={product.name}
          loading="lazy"
          onError={(e) => {
            if (fallbackImage) {
              e.currentTarget.onerror = null;
              e.currentTarget.src = fallbackImage;
            }
          }}
        />
      </div>
      <div className="store-product-copy">
        <small>{product.category}</small>
        <h3>{product.name}</h3>
        <strong>S/{unitPrice}</strong>
        {product.id === '00000000-0000-0000-0000-000000000009' && (
          <p>Precio baja por cantidad: desde S/10 hasta S/5 c/u.</p>
        )}
      </div>
      <div className="store-product-actions">
        <QuantitySelector value={quantity} onChange={onQuantityChange} />
        <button type="button" onClick={onAdd}>Agregar</button>
      </div>
      {quantity > 0 && <div className="store-product-subtotal">Subtotal: S/{subtotal}</div>}
    </article>
  );
}
