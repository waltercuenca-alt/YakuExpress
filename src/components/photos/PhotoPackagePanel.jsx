import React from 'react';

const priceRows = [
  ['1 FOTO', 'GRATIS', 'blue', ''],
  ['2 FOTOS', 'S/30', 'orange', ''],
  ['3 A 7 FOTOS', 'S/50', 'green', ''],
  ['TODAS LAS FOTOS', 'S/80', 'pink', 'Mas elegido'],
];

export default function PhotoPackagePanel({ totalPhotos, selectedCount, packageInfo, onSelectAll, onClear, onContinue }) {
  return (
    <aside className="photo-package">
      <div className="photo-price-title">PRECIOS</div>
      <div className="photo-price-list">
        {priceRows.map(([label, price, tone, badge]) => (
          <div className={`photo-price-row ${tone}`} key={label}>
            <i aria-hidden="true">
              <CameraIcon />
            </i>
            <span>{label}</span>
            <b>{price}</b>
            {badge && <em>{badge}</em>}
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
        CONTINUAR CON MI PEDIDO
      </button>
    </aside>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M8.5 6.5 10 4h4l1.5 2.5H19A2.5 2.5 0 0 1 21.5 9v8A2.5 2.5 0 0 1 19 19.5H5A2.5 2.5 0 0 1 2.5 17V9A2.5 2.5 0 0 1 5 6.5h3.5Z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}
