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
          setErrorMessage(
            result.usedFallbackBackground
              ? 'No pudimos cargar este fondo. Te mostramos una vista previa alternativa.'
              : ''
          );
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
          <span>Vista previa experimental</span>
          <h2>Montajes premium</h2>
          <p>Convertí tu foto en un recuerdo épico. Vista previa experimental, revisá el resultado antes de comprar.</p>
        </div>

        <div className="photo-montage-layout">
          <div className="photo-montage-controls">
            <p>Elegí una plantilla visual</p>
            <div className="photo-montage-template-grid">
              {PHOTO_MONTAGE_TEMPLATES.map((template) => (
                <button
                  className={`photo-montage-template ${template.id === templateId ? 'active' : ''}`}
                  type="button"
                  key={template.id}
                  onClick={() => setTemplateId(template.id)}
                >
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                  <small>{template.accentLabel}</small>
                </button>
              ))}
            </div>
            <p className="photo-montage-availability">Los fondos premium pueden variar según disponibilidad.</p>
          </div>

          <div className="photo-montage-preview-card">
            {isGenerating && <div className="photo-montage-loading">Preparando vista previa...</div>}
            {!isGenerating && errorMessage && <p className="photo-montage-error">{errorMessage}</p>}
            {!isGenerating && previewUrl && (
              <img src={previewUrl} alt={`Vista previa ${selectedTemplate.name}`} />
            )}
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
