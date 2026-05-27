import React from 'react';

export default function PhotoGallery({ photos, selectedIds, onToggle, onOpen }) {
  return (
    <div className="photos-grid">
      {photos.map((photo) => {
        const selected = selectedIds.includes(photo.id);
        return (
          <article className={`photo-card ${selected ? 'selected' : ''}`} key={photo.id}>
            <button className="photo-preview" type="button" onClick={() => onOpen(photo)}>
              <img src={photo.thumbUrl} alt={`Foto ${photo.number} YakuPark`} loading="lazy" />
              <span className="photo-preview-number">#{photo.number}</span>
              <span className="photo-watermark" aria-hidden="true">
                <b>YakuExpress Preview</b>
                <small>Vista previa</small>
              </span>
            </button>
            <label className="photo-select">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(photo.id)}
              />
              <span>{selected ? 'Seleccionada' : 'Seleccionar foto'}</span>
            </label>
          </article>
        );
      })}
    </div>
  );
}
