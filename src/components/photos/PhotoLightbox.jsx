import React from 'react';

export default function PhotoLightbox({ photo, onClose }) {
  return (
    <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Foto ${photo.number}`}>
      <button className="photo-lightbox-close" type="button" onClick={onClose} aria-label="Cerrar vista ampliada">
        <span aria-hidden="true">×</span>
      </button>
      <img src={photo.fullUrl} alt={`Foto ${photo.number} ampliada`} />
      <span>Foto #{photo.number}</span>
    </div>
  );
}
