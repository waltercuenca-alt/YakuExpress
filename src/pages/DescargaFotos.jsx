import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';

export default function DescargaFotos({ path = '' }) {
  const token = decodeURIComponent((path.split('/')[2] || '').trim());
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadPrivateOrder();
  }, [token]);

  const loadPrivateOrder = async () => {
    setLoading(true);
    setMessage('');
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

  if (loading) {
    return (
      <main className="private-download-shell">
        <section className="private-download-card loading">
          <span>YakuPark Adventure</span>
          <div className="private-download-spinner" />
          <h1>Preparando tus recuerdos...</h1>
          <p>Estamos cargando tu galería privada en HD.</p>
        </section>
      </main>
    );
  }

  if (!order || order.status !== 'completed') {
    return (
      <main className="private-download-shell">
        <section className="private-download-card locked">
          <span>YakuPark Adventure</span>
          <h1>Acceso a tus fotos</h1>
          <p>{message || 'Este pedido aun no esta habilitado para descarga.'}</p>
          <p className="private-download-security">Este enlace muestra únicamente las fotos incluidas en tu pedido.</p>
          {order && <strong>{order.order_code}</strong>}
          {order && (
            <button type="button" onClick={loadPrivateOrder}>
              Verificar estado
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="private-download-shell">
      <section className="private-download-card ready">
        <header className="private-download-header">
          <span>Pago confirmado</span>
          <h1>Tus recuerdos de Yakupark están listos</h1>
          <p>Descarga tus fotos HD desde este enlace privado.</p>
        </header>
        <div className="private-download-meta">
          <strong>{order.order_code}</strong>
          <small>{order.client_code} - {items.length} fotos</small>
        </div>
        <p className="private-download-security">Este enlace muestra únicamente las fotos incluidas en tu pedido.</p>
        <div className="private-download-list">
          {items.map((item) => (
            <article className="private-download-item" key={item.id}>
              <img src={item.image_url || item.hd_url} alt={`Foto ${item.photo_number} seleccionada`} />
              <div>
                <strong>Foto #{item.photo_number}</strong>
                <button type="button" onClick={() => downloadItem(item)} disabled={downloadingId === item.id}>
                  {downloadingId === item.id ? 'Descargando...' : 'Descargar HD'}
                </button>
              </div>
            </article>
          ))}
        </div>
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

function isValidToken(token) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
}
