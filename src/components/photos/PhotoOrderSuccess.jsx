import React, { useMemo, useState } from 'react';
import { supabase } from '../../supabase.js';

export default function PhotoOrderSuccess({ order, onBack }) {
  const [currentOrder, setCurrentOrder] = useState(order);
  const [items, setItems] = useState(normalizeItems(order.items));
  const [checking, setChecking] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState('');
  const orderCode = currentOrder.order_code || currentOrder.code;
  const clientCode = currentOrder.client_code || currentOrder.customer_code;
  const total = currentOrder.total_amount ?? currentOrder.total;
  const status = currentOrder.status || 'pending';
  const isCompleted = status === 'completed';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(orderCode)}`;
  const selectedLabels = useMemo(
    () => items.map((item) => `#${photoNumber(item)}`).join(', '),
    [items],
  );

  const verifyPayment = async () => {
    setChecking(true);
    setDownloadMessage('');
    try {
      const { data: freshOrder, error: orderError } = await supabase
        .from('photo_orders')
        .select('id, order_code, client_code, selected_count, package_type, total_amount, status, created_at')
        .eq('id', currentOrder.id)
        .single();
      if (orderError) throw orderError;

      const { data: freshItems, error: itemsError } = await supabase
        .from('photo_order_items')
        .select('id, photo_order_id, photo_number, image_url, hd_url')
        .eq('photo_order_id', freshOrder.id)
        .order('photo_number', { ascending: true });
      if (itemsError) throw itemsError;

      setCurrentOrder(freshOrder);
      setItems(normalizeItems(freshItems));
      if (freshOrder.status !== 'completed') {
        setDownloadMessage('Tu pedido aun esta pendiente de confirmacion en caja');
      }
    } catch (error) {
      console.error('YakuExpress verificar pago fotos error:', error);
      setDownloadMessage('No pudimos verificar el pago. Intenta nuevamente.');
    } finally {
      setChecking(false);
    }
  };

  const downloadOne = async (item) => {
    setDownloadMessage('');
    try {
      await downloadPhoto(item, clientCode);
    } catch (error) {
      console.error('YakuExpress descarga foto error:', error);
      setDownloadMessage(`No pudimos descargar la foto #${photoNumber(item)}.`);
    }
  };

  const downloadAllIndividually = async () => {
    for (const item of items) {
      await downloadOne(item);
    }
  };

  return (
    <main className="photos-shell">
      <section className={`photo-success ${isCompleted ? 'completed' : 'pending'}`}>
        <span>{isCompleted ? 'Pago confirmado' : 'Pedido generado'}</span>
        <h1>{orderCode}</h1>
        <p>{isCompleted ? 'Tus fotos HD estan listas' : 'Muestra este codigo en caja para confirmar tu compra.'}</p>
        <div className="photo-success-layout">
          <div className="photo-success-qr">
            <img src={qrUrl} alt={`QR pedido ${orderCode}`} />
          </div>
          <div className="photo-success-summary">
            <small>Codigo cliente</small>
            <strong>{clientCode}</strong>
            <small>Fotos</small>
            <strong>{selectedLabels}</strong>
            <small>Total</small>
            <strong>{formatTotal(total)}</strong>
            <small>Estado</small>
            <strong>{isCompleted ? 'Pago confirmado' : 'Esperando confirmacion de pago'}</strong>
          </div>
        </div>

        {!isCompleted && (
          <div className="photo-payment-pending">
            <strong>Tu pedido aun esta pendiente de confirmacion en caja</strong>
            <button type="button" onClick={verifyPayment} disabled={checking}>
              {checking ? 'Verificando...' : 'Verificar pago'}
            </button>
          </div>
        )}

        {isCompleted && (
          <div className="photo-downloads">
            <div className="photo-downloads-head">
              <strong>Descargas HD</strong>
              <button type="button" onClick={downloadAllIndividually}>
                Descargar mis fotos
              </button>
            </div>
            <div className="photo-download-list">
              {items.map((item) => (
                <article key={item.id || photoNumber(item)} className="photo-download-card">
                  <span>Foto #{photoNumber(item)}</span>
                  <button type="button" onClick={() => downloadOne(item)}>
                    Descargar HD
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}

        {downloadMessage && <p className="photo-download-message">{downloadMessage}</p>}
        <button type="button" onClick={onBack}>Elegir otras fotos</button>
      </section>
    </main>
  );
}

async function downloadPhoto(item, clientCode) {
  const url = item.hd_url || item.image_url || item.full_url || item.fullUrl;
  if (!url) throw new Error('missing photo url');
  const number = photoNumber(item);
  const fileName = `YakuPark-${clientCode}-foto-${number}.jpg`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function normalizeItems(rawItems = []) {
  return (Array.isArray(rawItems) ? rawItems : []).map((item) => ({
    ...item,
    photo_number: item.photo_number ?? item.number,
    image_url: item.image_url || item.full_url || item.fullUrl,
    hd_url: item.hd_url || item.image_url || item.full_url || item.fullUrl,
  }));
}

function photoNumber(item) {
  return item.photo_number ?? item.number ?? '-';
}

function formatTotal(total) {
  return Number(total) === 0 ? 'Gratis' : `S/${Number(total)}`;
}
