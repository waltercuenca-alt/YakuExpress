import React, { useEffect, useMemo, useRef, useState } from 'react';
import { generatePhotoMontage, downloadMontageDataUrl } from '../../utils/photoMontageCanvas.js';
import { PHOTO_MONTAGE_TEMPLATES, getPhotoMontageTemplate } from '../../utils/photoMontageTemplates.js';

function getPhotoSource(photo) {
  return photo?.fullUrl || photo?.hdUrl || photo?.imageUrl || photo?.previewUrl || photo?.thumbUrl || '';
}

function buildDownloadName(photo, template) {
  const number = photo?.number ? `-${photo.number}` : '';
  return `yakupark-montaje-${template.id}${number}.jpg`;
}

export default function PhotoMontageStudio({ photo, isOpen, onClose }) {
  const [templateId, setTemplateId] = useState(PHOTO_MONTAGE_TEMPLATES[0].id);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const generationIdRef = useRef(0);

  const selectedTemplate = useMemo(() => getPhotoMontageTemplate(templateId), [templateId]);
  const photoSource = getPhotoSource(photo);

  useEffect(() => {
    if (!isOpen || !photoSource) return undefined;
    const generationId = generationIdRef.current + 1;
    generationIdRef.current = generationId;
    let active = true;

    setIsGenerating(true);
    setErrorMessage('');

    const timer = window.setTimeout(() => {
      generatePhotoMontage({ photoUrl: photoSource, template: selectedTemplate })
        .then((result) => {
          if (!active || generationId !== generationIdRef.current) return;
          setPreviewUrl(result.dataUrl);
          setErrorMessage('');
        })
        .catch(() => {
          if (!active || generationId !== generationIdRef.current) return;
          setPreviewUrl('');
          setErrorMessage('No pudimos generar la vista previa en este momento. Probá con otra foto o plantilla.');
        })
        .finally(() => {
          if (active && generationId === generationIdRef.current) setIsGenerating(false);
        });
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isOpen, photoSource, selectedTemplate]);

  if (!isOpen || !photo) return null;

  return (
    <div className="photo-montage-backdrop" role="dialog" aria-modal="true" aria-label="Montajes premium">
      <section className="photo-montage-studio">
        <button className="photo-montage-close" type="button" onClick={onClose} aria-label="Cerrar montajes premium">
          <span aria-hidden="true">&times;</span>
        </button>

        <div className="photo-montage-head">
          <span>Souvenir Yakupark</span>
          <h2>Crea tu recuerdo Yakupark</h2>
          <p>Elige una foto, prueba un diseño souvenir y revisa la vista previa antes de comprar.</p>
        </div>

        <div className="photo-montage-layout">
          <div className="photo-montage-controls">
            <div className="photo-montage-controls-head">
              <p>Elige un diseño souvenir</p>
              <span>{PHOTO_MONTAGE_TEMPLATES.length} diseños</span>
            </div>
            <div className="photo-montage-template-grid">
              {PHOTO_MONTAGE_TEMPLATES.map((template, index) => {
                const isActive = template.id === templateId;
                return (
                  <button
                    className={`photo-montage-template ${isActive ? 'active' : ''}`}
                    type="button"
                    key={template.id}
                    onClick={() => setTemplateId(template.id)}
                    aria-pressed={isActive}
                  >
                    <span className="photo-montage-template-number" aria-hidden="true">{index + 1}</span>
                    <span className="photo-montage-template-copy">
                      <strong>{template.name}</strong>
                      <span>{template.description}</span>
                    </span>
                    <small>{isActive ? 'Seleccionado' : 'Probar diseño'}</small>
                  </button>
                );
              })}
            </div>
            <p className="photo-montage-availability">Los marcos premium pueden variar según disponibilidad.</p>
          </div>

          <div className="photo-montage-preview-zone">
            <div className="photo-montage-preview-head">
              <div>
                <small>Vista previa</small>
                <strong>{selectedTemplate.name}</strong>
              </div>
              <span className={isGenerating ? 'is-loading' : 'is-ready'}>
                {isGenerating ? 'Creando...' : 'Lista para revisar'}
              </span>
            </div>
            <div className="photo-montage-preview-card" aria-live="polite">
              {isGenerating && <div className="photo-montage-loading">Creando vista previa...</div>}
              {!isGenerating && errorMessage && <p className="photo-montage-error">{errorMessage}</p>}
              {!isGenerating && previewUrl && (
                <img src={previewUrl} alt={`Vista previa ${selectedTemplate.name}`} />
              )}
            </div>
            <p className="photo-montage-notice">Vista previa referencial. Revisa el diseño antes de comprar.</p>
          </div>
        </div>

        <div className="photo-montage-actions">
          <button type="button" onClick={onClose}>Cerrar</button>
          <button
            type="button"
            disabled={!previewUrl || isGenerating}
            onClick={() => downloadMontageDataUrl(previewUrl, buildDownloadName(photo, selectedTemplate))}
          >
            Descargar vista previa
          </button>
        </div>
      </section>
    </div>
  );
}
