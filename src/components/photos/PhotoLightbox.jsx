import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';

const PhotoMontageStudio = lazy(() => import('./PhotoMontageStudio.jsx'));

export default function PhotoLightbox({
  photo,
  photos = [],
  selectedIds = [],
  selectedCount = selectedIds.length,
  watermarkEnabled = true,
  onClose,
  onChangePhoto,
  onSelectToggle,
}) {
  const currentIndex = useMemo(() => {
    const index = photos.findIndex((item) => item.id === photo.id);
    return index >= 0 ? index : 0;
  }, [photo.id, photos]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const currentSelected = selectedIdSet.has(photo.id);
  const canNavigate = photos.length > 1;
  const [montageOpen, setMontageOpen] = useState(false);
  const [montageLoaded, setMontageLoaded] = useState(false);

  const openMontage = useCallback(() => {
    setMontageLoaded(true);
    setMontageOpen(true);
  }, []);

  const goToPhoto = useCallback((nextIndex) => {
    if (!photos.length) return;
    const normalizedIndex = (nextIndex + photos.length) % photos.length;
    onChangePhoto?.(photos[normalizedIndex]);
  }, [onChangePhoto, photos]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (montageOpen) {
          setMontageOpen(false);
          return;
        }
        onClose?.();
      }

      if (montageOpen) return;

      if (event.key === 'ArrowLeft' && canNavigate) {
        goToPhoto(currentIndex - 1);
      }

      if (event.key === 'ArrowRight' && canNavigate) {
        goToPhoto(currentIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canNavigate, currentIndex, goToPhoto, montageOpen, onClose]);

  return (
    <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Foto ${photo.number}`}>
      <button className="photo-lightbox-close" type="button" onClick={onClose} aria-label="Cerrar vista ampliada">
        <span aria-hidden="true">&times;</span>
      </button>

      <div className="photo-lightbox-stage">
        {canNavigate && (
          <button
            className="photo-lightbox-nav previous"
            type="button"
            onClick={() => goToPhoto(currentIndex - 1)}
            aria-label="Ver foto anterior"
          >
            <span aria-hidden="true">&lsaquo;</span>
          </button>
        )}

        <div className={`photo-lightbox-preview ${currentSelected ? 'selected' : ''}`}>
          <img src={photo.fullUrl} alt={`Foto ${photo.number} ampliada`} decoding="async" />
          {watermarkEnabled && (
            <span className="photo-watermark" aria-hidden="true">
              <b>YakuExpress Preview</b>
              <small>Foto protegida</small>
            </span>
          )}
        </div>

        {canNavigate && (
          <button
            className="photo-lightbox-nav next"
            type="button"
            onClick={() => goToPhoto(currentIndex + 1)}
            aria-label="Ver foto siguiente"
          >
            <span aria-hidden="true">&rsaquo;</span>
          </button>
        )}
      </div>

      <div className="photo-lightbox-panel">
        <div className="photo-lightbox-toolbar">
          <div>
            <span className="photo-lightbox-caption">Foto #{photo.number}</span>
            <small>{selectedCount} fotos seleccionadas</small>
          </div>
          <div className="photo-lightbox-actions">
            <button
              className="photo-lightbox-montage"
              type="button"
              onClick={openMontage}
            >
              Crear montaje
            </button>
            <button
              className={`photo-lightbox-select ${currentSelected ? 'selected' : ''}`}
              type="button"
              onClick={() => onSelectToggle?.(photo.id)}
            >
              {currentSelected ? 'Quitar seleccion' : 'Seleccionar foto'}
            </button>
          </div>
        </div>

        <div className="photo-filmstrip" aria-label="Miniaturas de fotos">
          {photos.map((item, index) => {
            const selected = selectedIdSet.has(item.id);
            const active = item.id === photo.id;

            return (
              <button
                className={`photo-filmstrip-item ${active ? 'active' : ''} ${selected ? 'selected' : ''}`}
                type="button"
                key={item.id}
                onClick={() => goToPhoto(index)}
                aria-label={`Ver foto ${item.number}${selected ? ', seleccionada' : ''}`}
                aria-current={active ? 'true' : undefined}
              >
                <img src={item.thumbUrl || item.fullUrl} alt={`Miniatura foto ${item.number}`} loading="lazy" decoding="async" />
                <span className="photo-filmstrip-number">#{item.number}</span>
                {selected && <span className="photo-filmstrip-check" aria-hidden="true">&#10003;</span>}
              </button>
            );
          })}
        </div>
      </div>

      {montageLoaded && (
        <Suspense fallback={<MontageLoading />}>
          <PhotoMontageStudio photo={photo} isOpen={montageOpen} onClose={() => setMontageOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

function MontageLoading() {
  return (
    <div className="photo-montage-backdrop" role="status" aria-live="polite">
      <div className="photo-montage-studio">
        <div className="photo-montage-loading">Preparando montajes...</div>
      </div>
    </div>
  );
}
