import React from 'react';

const priceRows = [
  ['1 FOTO', 'GRATIS', 'blue'],
  ['2 FOTOS', 'S/30', 'orange'],
  ['3 A 7 FOTOS', 'S/50', 'green'],
  ['TODAS LAS FOTOS', 'S/80', 'pink'],
];

export default function PhotoPackagePanel({ totalPhotos, selectedCount, packageInfo, onSelectAll, onClear, onContinue }) {
  return (
    <aside className="photo-package">
      <div className="photo-price-title">PRECIOS</div>
      <div className="photo-price-list">
        {priceRows.map(([label, price, tone]) => (
          <div className={`photo-price-row ${tone}`} key={label}>
            <i>📸</i>
            <span>{label}</span>
            <b>{price}</b>
          </div>
        ))}
      </div>
      <span>Tu paquete actual</span>
      <strong>Tus seleccionadas: {selectedCount}</strong>
      <div className="photo-package-total">
        <small>Total</small>
        <b>{packageInfo.displayTotal}</b>
      </div>
      <p>{packageInfo.label}</p>
      {packageInfo.upsell && <em>{packageInfo.upsell}</em>}
      <div className="photo-package-actions">
        <button type="button" onClick={onSelectAll} disabled={!totalPhotos || selectedCount === totalPhotos}>
          Todas las fotos
        </button>
        <button type="button" onClick={onClear} disabled={!selectedCount}>
          Limpiar
        </button>
      </div>
      <button className="photo-continue-button" type="button" onClick={onContinue} disabled={!selectedCount}>
        CONTINUAR PEDIDO
      </button>
    </aside>
  );
}
