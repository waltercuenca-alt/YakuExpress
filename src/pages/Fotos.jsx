import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';
import PhotoGallery from '../components/photos/PhotoGallery.jsx';
import PhotoLightbox from '../components/photos/PhotoLightbox.jsx';
import PhotoOrderSuccess from '../components/photos/PhotoOrderSuccess.jsx';
import PhotoPackagePanel from '../components/photos/PhotoPackagePanel.jsx';
import PhotoSearch from '../components/photos/PhotoSearch.jsx';
import PhotoSummaryModal from '../components/photos/PhotoSummaryModal.jsx';

export default function Fotos({ navigate, path = '' }) {
  const routeCode = decodeURIComponent((path.split('/')[2] || '').trim()).toUpperCase();
  const [code, setCode] = useState(routeCode);
  const [searchedCode, setSearchedCode] = useState('');
  const [photos, setPhotos] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState('');
  const [orderError, setOrderError] = useState('');
  const [activePhoto, setActivePhoto] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [successOrder, setSuccessOrder] = useState(null);

  const selectedPhotos = useMemo(
    () => photos.filter((photo) => selectedIds.includes(photo.id)),
    [photos, selectedIds],
  );
  const packageInfo = useMemo(
    () => photoPackageFor(selectedPhotos.length, photos.length),
    [selectedPhotos.length, photos.length],
  );

  useEffect(() => {
    if (routeCode && routeCode !== searchedCode) {
      setCode(routeCode);
      void searchPhotos(routeCode, { updateRoute: false });
    }
  }, [routeCode]);

  const submitSearch = async (event) => {
    event.preventDefault();
    await searchPhotos(code, { updateRoute: true });
  };

  const searchPhotos = async (rawCode, options = {}) => {
    const nextCode = String(rawCode || '').trim().toUpperCase();
    if (!nextCode) return;

    setLoading(true);
    setError('');
    setOrderError('');
    setPhotos([]);
    setSelectedIds([]);
    setSearchedCode(nextCode);
    setSuccessOrder(null);

    if (options.updateRoute && navigate) {
      navigate(`/fotos/${encodeURIComponent(nextCode)}`);
    }

    try {
      const nextPhotos = await loadClientPhotos(nextCode);
      setPhotos(nextPhotos);
      if (!nextPhotos.length) {
        setError('No encontramos fotos para este codigo');
      }
    } catch (loadError) {
      console.error('YakuExpress fotos error:', loadError);
      setError('No pudimos cargar tus fotos por ahora. Intenta nuevamente o consulta en caja.');
    } finally {
      setLoading(false);
    }
  };

  const togglePhoto = (photoId) => {
    setSelectedIds((current) => (
      current.includes(photoId)
        ? current.filter((id) => id !== photoId)
        : [...current, photoId]
    ));
  };

  const selectAll = () => setSelectedIds(photos.map((photo) => photo.id));
  const clearSelection = () => setSelectedIds([]);

  const createPhotoOrder = async () => {
    if (!searchedCode || !selectedPhotos.length) return;

    setCreatingOrder(true);
    setOrderError('');
    try {
      const orderCode = await nextPhotoOrderCode();
      const { data: order, error: orderInsertError } = await supabase
        .from('photo_orders')
        .insert({
          code: orderCode,
          customer_code: searchedCode,
          photo_count: selectedPhotos.length,
          total: packageInfo.total,
          status: 'pending',
        })
        .select()
        .single();

      if (orderInsertError) throw orderInsertError;

      const rows = selectedPhotos.map((photo) => ({
        order_id: order.id,
        public_id: photo.publicId,
        preview_url: photo.thumbUrl,
        full_url: photo.fullUrl,
        photo_number: photo.number,
      }));
      const { error: itemsInsertError } = await supabase.from('photo_order_items').insert(rows);
      if (itemsInsertError) throw itemsInsertError;

      setSummaryOpen(false);
      setSuccessOrder({
        ...order,
        code: orderCode,
        customer_code: searchedCode,
        items: selectedPhotos,
        total: packageInfo.total,
      });
    } catch (createError) {
      console.error('YakuExpress fotos order error:', createError);
      setOrderError('No pudimos generar el pedido. Verifica que el SQL de fotos ya este ejecutado en Supabase.');
    } finally {
      setCreatingOrder(false);
    }
  };

  if (successOrder) {
    return (
      <PhotoOrderSuccess
        order={successOrder}
        onBack={() => {
          setSuccessOrder(null);
          setSelectedIds([]);
        }}
      />
    );
  }

  return (
    <main className="photos-shell">
      <section className="photos-poster">
        <header className="photos-poster-head">
          <div className="photos-logo">Yaku<br />Park</div>
          <div className="photos-title-block">
            <h1>¡ELIGE TUS MEJORES MOMENTOS!</h1>
            <p>Vista previa de tus fotos</p>
          </div>
          <PhotoSearch code={code} setCode={setCode} loading={loading} onSubmit={submitSearch} />
        </header>

        <section className="photos-poster-body">
          <div className="photos-results">
            {searchedCode && (
              <div className="photos-results-head">
                <div>
                  <small>Codigo cliente</small>
                  <strong>{searchedCode}</strong>
                </div>
                <span>{selectedPhotos.length} fotos seleccionadas</span>
              </div>
            )}

            {loading && <PhotoLoading />}

            {!loading && error && (
              <div className="photos-empty">
                <strong>{error}</strong>
                <p>Verifica el numero o consulta en caja.</p>
                <button type="button" onClick={() => navigate?.('/cliente')}>Volver</button>
              </div>
            )}

            {!loading && !error && photos.length > 0 && (
              <PhotoGallery
                photos={photos}
                selectedIds={selectedIds}
                onToggle={togglePhoto}
                onOpen={setActivePhoto}
              />
            )}
          </div>

          <PhotoPackagePanel
            totalPhotos={photos.length}
            selectedCount={selectedPhotos.length}
            packageInfo={packageInfo}
            onSelectAll={selectAll}
            onClear={clearSelection}
            onContinue={() => setSummaryOpen(true)}
          />
        </section>

        <footer className="photos-poster-footer">
          <div><b>¡REVIVE CADA AVENTURA!</b><span>Selecciona tus fotos favoritas</span></div>
          <div><b>MARCA TUS FAVORITAS</b><span>y llevalas contigo</span></div>
          <div><b>¡LLEVA LA DIVERSION A CASA!</b><span>Gracias por vivir YakuPark</span></div>
        </footer>
      </section>

      {summaryOpen && (
        <PhotoSummaryModal
          customerCode={searchedCode}
          photos={selectedPhotos}
          packageInfo={packageInfo}
          creating={creatingOrder}
          error={orderError}
          onClose={() => setSummaryOpen(false)}
          onConfirm={createPhotoOrder}
        />
      )}

      {activePhoto && (
        <PhotoLightbox photo={activePhoto} onClose={() => setActivePhoto(null)} />
      )}
    </main>
  );
}

async function loadClientPhotos(code) {
  const folder = `yakupark/clientes/${code}`;
  console.log('[YakuFotos] solicitando fotos', { code, folder, functionName: 'list-client-photos' });

  const { data, error } = await supabase.functions.invoke('list-client-photos', {
    body: { code },
  });

  console.log('[YakuFotos] respuesta Edge Function', { data, error });

  if (error) {
    console.error('[YakuFotos] error invoke Supabase', error);
    throw error;
  }
  if (!data?.ok) {
    console.error('[YakuFotos] error backend fotos', data);
    throw new Error(data?.error || 'No pudimos listar las fotos del cliente.');
  }

  const photos = Array.isArray(data.photos) ? data.photos : [];
  console.log('[YakuFotos] fotos recibidas', {
    code: data.code,
    folder: data.folder,
    count: photos.length,
    photos,
  });
  return photos;
}

async function nextPhotoOrderCode() {
  const { data, error } = await supabase
    .from('photo_orders')
    .select('code')
    .like('code', 'YK-PHOTO-%')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const lastCode = data?.[0]?.code || '';
  const lastNumber = Number(String(lastCode).replace(/\D/g, '')) || 0;
  return `YK-PHOTO-${String(lastNumber + 1).padStart(4, '0')}`;
}

function photoPackageFor(selectedCount, totalPhotos) {
  if (!selectedCount) return { label: 'Sin fotos seleccionadas', total: 0, displayTotal: 'S/0', upsell: '' };
  if (selectedCount === 1) return { label: '1 foto', total: 0, displayTotal: 'Gratis', upsell: 'Selecciona una mas y arma tu primer paquete.' };
  if (totalPhotos > 1 && selectedCount === totalPhotos) return { label: 'Todas las fotos', total: 80, displayTotal: 'S/80', upsell: 'Te llevas todos los recuerdos de tu aventura.' };
  if (selectedCount === 2) return { label: '2 fotos', total: 30, displayTotal: 'S/30', upsell: totalPhotos > 2 ? 'Por S/50 mas llevate todas las fotos.' : '' };
  if (selectedCount <= 7) return { label: '3 a 7 fotos', total: 50, displayTotal: 'S/50', upsell: totalPhotos > selectedCount ? 'Por S/30 mas llevate todas las fotos.' : '' };
  return { label: 'Paquete completo', total: 80, displayTotal: 'S/80', upsell: 'Listo para retirar en caja.' };
}

function PhotoLoading() {
  return (
    <div className="photos-loading">
      <span />
      <strong>Buscando tus mejores momentos...</strong>
      <p>Estamos revisando la galeria publica de YakuPark.</p>
    </div>
  );
}
