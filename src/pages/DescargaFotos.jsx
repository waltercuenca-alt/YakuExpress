import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';

export default function DescargaFotos({ path = '' }) {
  const token = decodeURIComponent((path.split('/')[2] || '').trim());
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState('');
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkWarning, setBulkWarning] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadPrivateOrder();
  }, [token]);

  const loadPrivateOrder = async () => {
    setLoading(true);
    setMessage('');
    setBulkMessage('');
    setBulkWarning(false);
    setItems([]);
    if (!isValidToken(token)) {
      setOrder(null);
      setMessage('Este link de descarga no es valido.');
      setLoading(false);
      return;
    }

    try {
      const { data: payload, error: payloadError } = await supabase.rpc('get_paid_photo_download', {
        p_token: token,
      });
      if (payloadError) throw payloadError;
      if (!payload) {
        setOrder(null);
        setMessage('No encontramos este pedido de fotos.');
        return;
      }

      if (!payload.enabled) {
        setOrder({ order_code: payload.order_code, status: payload.status });
        return;
      }

      setOrder(payload.order);
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      console.error('YakuExpress descarga privada error:', error);
      setMessage('No pudimos cargar tus fotos. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const downloadItem = async (item) => {
    setDownloadingId(item.id);
    setMessage('');
    try {
      await downloadPhoto(item, order.client_code);
    } catch (error) {
      console.error('YakuExpress descarga privada archivo error:', error);
      setMessage(`No pudimos descargar la foto #${item.photo_number}.`);
    } finally {
      setDownloadingId('');
    }
  };

  const handleDownloadAll = async () => {
    if (!items.length || downloadingAll) return;
    setMessage('');
    setBulkWarning(false);
    setBulkMessage('Preparando descargas...');
    setDownloadingAll(true);
    let failedDownloads = 0;
    for (const item of items) {
      try {
        await downloadPhoto(item, order.client_code);
      } catch (error) {
        failedDownloads += 1;
        console.error('YakuExpress descarga privada multiple error:', error);
      }
      if (items.length > 1) await waitForDownload(240);
    }
    setDownloadingAll(false);
    if (failedDownloads) {
      setBulkWarning(true);
      setBulkMessage(failedDownloads === items.length
        ? 'No pudimos iniciar las descargas. Proba descargar cada foto.'
        : 'Descargas iniciadas. Una o mas fotos no pudieron prepararse.');
      return;
    }
    setBulkMessage('Descargas iniciadas.');
  };

  if (loading) {
    return (
      <main className="private-download-shell">
        <section className="private-download-card loading" aria-live="polite">
          <div className="private-download-brand">
            <strong>Yaku</strong>
            <span>Park</span>
          </div>
          <span className="private-download-status neutral">Enlace privado</span>
          <div className="private-download-spinner" aria-hidden="true" />
          <h1>Estamos verificando tu enlace de descarga...</h1>
          <p>Esto puede tomar unos segundos.</p>
        </section>
      </main>
    );
  }

  if (!order || order.status !== 'completed') {
    const isUnavailable = !order;
    return (
      <main className="private-download-shell">
        <section className={`private-download-card locked ${isUnavailable ? 'unavailable' : ''}`}>
          <div className="private-download-brand">
            <strong>Yaku</strong>
            <span>Park</span>
          </div>
          <span className={`private-download-status ${isUnavailable ? 'error' : 'pending'}`}>
            {isUnavailable ? 'Enlace no disponible' : 'Pedido en preparación'}
          </span>
          <div className="private-download-state-mark" aria-hidden="true">
            {isUnavailable ? '!' : '...'}
          </div>
          <h1>
            {isUnavailable
              ? 'No pudimos encontrar este enlace de descarga.'
              : 'Tu pedido todavía está siendo preparado.'}
          </h1>
          <p>
            {isUnavailable
              ? 'Verifica que el enlace esté completo o solicita ayuda con tu código de pedido.'
              : 'Cuando Caja confirme el pago, este enlace quedará habilitado para descargar tus fotos.'}
          </p>
          {order && (
            <div className="private-download-order-code">
              <small>Código de pedido</small>
              <strong>{order.order_code}</strong>
            </div>
          )}
          <p className="private-download-help">
            {isUnavailable
              ? 'Tu enlace es privado y no muestra información técnica ni datos sensibles.'
              : 'Si ya pagaste, consulta con atención de Yakupark.'}
          </p>
          {order && (
            <button type="button" onClick={loadPrivateOrder}>
              Verificar nuevamente
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="private-download-shell">
      <section className="private-download-card ready">
        <div className="private-download-brand">
          <strong>Yaku</strong>
          <span>Park</span>
        </div>
        <header className="private-download-header">
          <span className="private-download-status success">Pago confirmado</span>
          <h1>Tus fotos están listas</h1>
          <p>Descarga tus fotos compradas de forma privada y segura.</p>
        </header>
        <div className="private-download-meta">
          <div>
            <small>Código de pedido</small>
            <strong>{order.order_code}</strong>
          </div>
          <div>
            <small>Fotos disponibles</small>
            <strong>{items.length}</strong>
          </div>
        </div>
        <p className="private-download-security">Este enlace es privado y muestra únicamente las fotos incluidas en tu pedido.</p>
        <div className="private-download-bulk">
          <div>
            <strong>Descarga tu pedido</strong>
            <small>Puedes descargar todas las fotos o elegirlas una por una.</small>
          </div>
          <button type="button" onClick={handleDownloadAll} disabled={downloadingAll || !items.length}>
            {downloadingAll ? 'Preparando descargas...' : 'Descargar todas las fotos'}
          </button>
          {bulkMessage && (
            <p className={`private-download-bulk-message ${bulkWarning ? 'warning' : ''}`} aria-live="polite">
              {bulkMessage}
            </p>
          )}
        </div>
        <section className="private-download-gallery" aria-label="Fotos disponibles para descargar">
          <div className="private-download-gallery-head">
            <div>
              <small>Tu selección</small>
              <h2>Tus fotos</h2>
            </div>
            <span>{items.length} {items.length === 1 ? 'foto' : 'fotos'}</span>
          </div>
          <div className="private-download-list">
            {items.map((item) => (
              <article className="private-download-item" key={item.id}>
                <div className="private-download-image">
                  <img
                    src={item.image_url || item.hd_url}
                    alt={`Foto ${item.photo_number} seleccionada`}
                    loading="lazy"
                    decoding="async"
                  />
                  <span>#{item.photo_number}</span>
                </div>
                <div className="private-download-item-body">
                  <div>
                    <small>Foto seleccionada</small>
                    <strong>Foto #{item.photo_number}</strong>
                  </div>
                  <button type="button" onClick={() => downloadItem(item)} disabled={downloadingId === item.id || downloadingAll}>
                    {downloadingId === item.id ? 'Descargando...' : 'Descargar foto'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
        {message && <p className="private-download-message">{message}</p>}
      </section>
    </main>
  );
}

async function downloadPhoto(item, clientCode) {
  const url = item.hd_url || item.image_url;
  if (!url) throw new Error('missing image url');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `YakuPark-${clientCode}-foto-${item.photo_number}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function waitForDownload(delay) {
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

function isValidToken(token) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
}
