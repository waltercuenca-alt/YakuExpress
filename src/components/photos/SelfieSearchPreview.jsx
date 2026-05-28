import React, { useEffect, useRef, useState } from 'react';

export default function SelfieSearchPreview() {
  const [selfieUrl, setSelfieUrl] = useState('');
  const [selfieName, setSelfieName] = useState('');
  const [messageOpen, setMessageOpen] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => () => {
    if (selfieUrl) URL.revokeObjectURL(selfieUrl);
  }, [selfieUrl]);

  const loadSelfie = (file) => {
    if (!file || !file.type?.startsWith('image/')) return;
    const nextUrl = URL.createObjectURL(file);
    setSelfieUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return nextUrl;
    });
    setSelfieName(file.name || 'selfie');
  };

  const handleFileChange = (event) => {
    loadSelfie(event.target.files?.[0]);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    loadSelfie(event.dataTransfer.files?.[0]);
  };

  const openPicker = () => fileInputRef.current?.click();

  return (
    <section className="selfie-search-card" aria-label="Buscar mis fotos con selfie">
      <div className="selfie-search-copy">
        <span className="selfie-beta">Proximamente IA</span>
        <h2>Busca tus fotos con selfie</h2>
        <p>Sube una foto tuya y pronto te ayudaremos a encontrar tus mejores recuerdos en YakuPark.</p>
      </div>

      <div
        className={`selfie-dropzone ${selfieUrl ? 'has-selfie' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="user"
          onChange={handleFileChange}
          aria-label="Subir selfie"
        />

        {selfieUrl ? (
          <div className="selfie-preview">
            <img src={selfieUrl} alt="Selfie cargada" />
            <div>
              <strong>Tu selfie cargada</strong>
              <small>{selfieName}</small>
            </div>
          </div>
        ) : (
          <div className="selfie-empty">
            <b aria-hidden="true">CAM</b>
            <strong>Subir selfie</strong>
            <small>JPG, PNG o WEBP. En celular puedes usar camara o galeria.</small>
          </div>
        )}

        <div className="selfie-actions">
          <button type="button" className="ghost" onClick={openPicker}>
            {selfieUrl ? 'Cambiar foto' : 'Subir selfie'}
          </button>
          <button type="button" onClick={() => setMessageOpen(true)} disabled={!selfieUrl}>
            Buscar coincidencias
          </button>
        </div>
      </div>

      <small className="selfie-disclaimer">
        Tu selfie solo se usa temporalmente para busqueda y no se comparte.
      </small>

      {messageOpen && (
        <div className="selfie-modal-backdrop" role="dialog" aria-modal="true" aria-label="Busqueda inteligente pronto">
          <section className="selfie-modal">
            <button type="button" className="photo-modal-close" onClick={() => setMessageOpen(false)} aria-label="Cerrar">
              &times;
            </button>
            <span>Muy pronto</span>
            <h2>Busqueda inteligente por rostro</h2>
            <p>Estamos preparando una experiencia con IA para que encuentres tus recuerdos mas rapido.</p>
            <div className="selfie-next-options">
              <strong>Mientras tanto puedes buscar usando:</strong>
              <small>Codigo de grupo</small>
              <small>Dia + codigo</small>
            </div>
            <button type="button" onClick={() => setMessageOpen(false)}>Entendido</button>
          </section>
        </div>
      )}
    </section>
  );
}
