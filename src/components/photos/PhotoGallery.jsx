import React, { memo, useEffect, useMemo, useState } from 'react';

const INITIAL_VISIBLE_PHOTOS = 48;
const VISIBLE_PHOTOS_STEP = 48;

function PhotoGallery({ photos, selectedIds, onToggle, onOpen, watermarkEnabled = true }) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_PHOTOS);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visiblePhotos = useMemo(
    () => photos.slice(0, visibleCount),
    [photos, visibleCount],
  );
  const remainingCount = Math.max(photos.length - visiblePhotos.length, 0);
  const nextBatchCount = Math.min(VISIBLE_PHOTOS_STEP, remainingCount);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_PHOTOS);
  }, [photos]);

  return (
    <>
      <div className="photos-grid">
        {visiblePhotos.map((photo) => (
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

      {remainingCount > 0 && (
        <div className="photo-gallery-progress" aria-live="polite">
          <span>Mostrando {visiblePhotos.length} de {photos.length} fotos</span>
          <button
            type="button"
            onClick={() => setVisibleCount((current) => Math.min(current + VISIBLE_PHOTOS_STEP, photos.length))}
          >
            Ver {nextBatchCount} fotos mas
          </button>
        </div>
      )}
    </>
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
