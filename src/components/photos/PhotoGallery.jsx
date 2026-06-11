import React, { memo, useMemo } from 'react';

function PhotoGallery({ photos, selectedIds, onToggle, onOpen, watermarkEnabled = true }) {
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <div className="photos-grid">
      {photos.map((photo) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          selected={selectedIdSet.has(photo.id)}
          watermarkEnabled={watermarkEnabled}
          onOpen={onOpen}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

const PhotoCard = memo(function PhotoCard({
  photo,
  selected,
  watermarkEnabled,
  onOpen,
  onToggle,
}) {
  return (
    <article className={`photo-card ${selected ? 'selected' : ''}`}>
      <button className="photo-preview" type="button" onClick={() => onOpen(photo)}>
        <img src={photo.thumbUrl} alt={`Foto ${photo.number} YakuPark`} loading="lazy" decoding="async" />
        <span className="photo-preview-number">#{photo.number}</span>
        {watermarkEnabled && (
          <span className="photo-watermark" aria-hidden="true">
            <b>YakuExpress Preview</b>
            <small>Vista previa</small>
          </span>
        )}
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
});

export default memo(PhotoGallery);
