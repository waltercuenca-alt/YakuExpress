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
  const selectedCount = currentOrder.selected_count ?? currentOrder.photo_count ?? items.length;
  const packageType = currentOrder.package_type || currentOrder.photo_package || '';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(orderCode)}`;
  const selectedLabels = useMemo(
    () => items.map((item) => `#${photoNumber(item)}`).join(', '),
    [items],
  );
  const statusLabel = isCompleted ? 'Pago confirmado' : 'Esperando confirmacion de pago';

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
        <header className="photo-success-hero">
          <span className="photo-success-icon" aria-hidden="true">OK</span>
          <div>
            <small>{isCompleted ? 'Pago confirmado' : 'Pedido generado'}</small>
            <h1>{isCompleted ? 'Tus fotos ya estan listas' : 'Tus recuerdos ya estan casi listos'}</h1>
            <p>
              {isCompleted
                ? 'Tu compra fue confirmada. Ya podes descargar las fotos incluidas en este pedido.'
                : 'Confirma tu compra en caja y recibi el acceso para descargar tus fotos de Yakupark.'}
            </p>
          </div>
        </header>

        <div className="photo-success-layout">
          <section className="photo-success-code-card" aria-label="Codigo del pedido de fotos">
            <span>Codigo de tu pedido</span>
            <strong>{orderCode}</strong>
            <p>{isCompleted ? 'Conserva este codigo como referencia de tu compra.' : 'Mostra este codigo en caja para confirmar tu compra.'}</p>
            <div className="photo-success-qr">
              <img src={qrUrl} alt={`QR pedido ${orderCode}`} />
              <small>Mostralo en caja junto con tu codigo de pedido.</small>
            </div>
          </section>

          <section className="photo-success-summary" aria-label="Resumen de compra">
            <div className="photo-success-summary-head">
              <small>Resumen de compra</small>
              <strong>{formatTotal(total)}</strong>
            </div>
            <dl>
              <div>
                <dt>Fotos seleccionadas</dt>
                <dd>{selectedCount}</dd>
              </div>
              {packageType && (
                <div>
                  <dt>Paquete</dt>
                  <dd>{packageType}</dd>
                </div>
              )}
              <div>
                <dt>Codigo cliente</dt>
                <dd>{clientCode}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>{statusLabel}</dd>
              </div>
            </dl>
            <div className="photo-success-selected">
              <small>Fotos elegidas</small>
              <p>{selectedLabels || `${selectedCount} fotos seleccionadas`}</p>
            </div>
          </section>
        </div>

        {!isCompleted && (
          <section className="photo-success-next-steps" aria-label="Proximos pasos">
            <h2>Que sigue ahora?</h2>
            <ol>
              <li><span>1</span><p>Mostra tu codigo o QR en caja.</p></li>
              <li><span>2</span><p>Confirma el pago de tus fotos seleccionadas.</p></li>
              <li><span>3</span><p>Recibi el acceso para descargar tus recuerdos.</p></li>
            </ol>
          </section>
        )}

        {!isCompleted && (
          <div className="photo-success-note">
            Tus fotos seleccionadas quedaran asociadas a este pedido. Guarda tu codigo hasta finalizar la compra.
          </div>
        )}

        {!isCompleted && (
          <div className="photo-payment-pending">
            <strong>Tu pedido aun esta pendiente de confirmacion en caja.</strong>
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
        <button className="photo-success-back" type="button" onClick={onBack}>Elegir otras fotos</button>
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
