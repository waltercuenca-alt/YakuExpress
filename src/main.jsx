import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase, syncOrderToSheets } from './supabase.js';
import './styles.css';

const products = [
  { id: 'standard', name: 'Pulsera Standard', price: 50, minutes: 45, subtitle: '45 minutos dentro del parque', note: 'Ideal si queres una experiencia rapida.', details: ['45 minutos'] },
  { id: 'full_pass', name: 'Full Pass', price: 80, minutes: 90, subtitle: '90 minutos dentro del parque', badge: 'MAS ELEGIDO', secondBadge: 'MEJOR EXPERIENCIA', details: ['90 minutos de diversion', '1 foto gratis incluida', 'media de regalo', 'mas tiempo para disfrutar'], microcopy: 'Por S/30 mas que Standard, duplicas tu tiempo y te llevas 1 foto gratis.', hero: true },
  { id: 'premium_kids', name: 'Premium Kids', price: 60, minutes: 90, subtitle: '90 minutos para ninos', details: ['90 minutos para ninos'] },
  { id: 'kids_normal', name: 'Kids Normal', price: 30, minutes: 45, subtitle: '45 minutos para ninos', details: ['45 minutos para ninos'] },
];

const shortSlots = ['9:30 a 10:15', '10:30 a 11:15', '11:30 a 12:15', '12:30 a 13:15', '13:30 a 14:15', '14:30 a 15:15', '15:30 a 16:15', '16:30 a 17:15', '17:15 a 18:00'];
const longSlots = ['9:30 a 11:00', '10:30 a 12:00', '11:30 a 13:00', '12:30 a 14:00', '13:30 a 15:00', '14:30 a 16:00', '15:30 a 17:00', '16:30 a 18:00'];
const photoPacks = [
  { id: 'none', label: 'No quiero fotos', price: 0, description: 'Solo quiero disfrutar el parque.' },
  { id: '2_fotos', label: '2 fotos', price: 30, description: 'Un recuerdo simple de tu experiencia.' },
  { id: '3_5_fotos', label: '3 a 5 fotos', price: 50, description: 'Mas momentos para compartir con tu familia o amigos.', recommended: true },
  { id: 'todas', label: 'Todas tus fotos', price: 80, description: 'No te pierdas ningun momento del dia.', featured: true, badge: 'MAS ELEGIDO', microcopy: 'Muchas familias eligen este pack para no perder ningun recuerdo.' },
];
const payMethods = ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Transferencia', 'Otro'];
const statusLabels = {
  pedido_creado: 'Pedido creado',
  cliente_en_caja: 'Cliente en caja',
  pago_procesado: 'Pago procesado',
  finalizado: 'Finalizado',
  problema_demora: 'Problema / demora',
  pending: 'Pedido creado',
  paid: 'Pago procesado',
  in_fazzure: 'Finalizado',
  cancelled: 'Problema / demora',
  expired: 'Expirado',
};
const orderStatusMeta = {
  pedido_creado: { label: 'Pedido creado', tone: 'created' },
  cliente_en_caja: { label: 'Cliente en caja', tone: 'cashier' },
  pago_procesado: { label: 'Pago procesado', tone: 'paid' },
  finalizado: { label: 'Finalizado', tone: 'finalized' },
  problema_demora: { label: 'Problema / demora', tone: 'delayed' },
  expired: { label: 'Expirado', tone: 'expired' },
  pending: { label: 'Pedido creado', tone: 'created' },
  paid: { label: 'Pago procesado', tone: 'paid' },
  in_fazzure: { label: 'Finalizado', tone: 'finalized' },
  cancelled: { label: 'Problema / demora', tone: 'delayed' },
};
const cashierStatusFilters = [
  ['', 'Todos'],
  ['pedido_creado', 'Pedido creado'],
  ['cliente_en_caja', 'Cliente en caja'],
  ['pago_procesado', 'Pago procesado'],
  ['finalizado', 'Finalizados'],
  ['problema_demora', 'Problema / demora'],
];
const cashierStatusActions = [
  ['cliente_en_caja', 'Marcar cliente en caja'],
  ['pago_procesado', 'Marcar pago procesado'],
  ['finalizado', 'Finalizar pedido'],
  ['problema_demora', 'Marcar problema'],
];
const legacyStatusFallbacks = {
  pedido_creado: 'pending',
  pago_procesado: 'paid',
  finalizado: 'in_fazzure',
  problema_demora: 'cancelled',
};
const soundEventByStatus = {
  pedido_creado: 'new_order',
  cliente_en_caja: 'customer_at_cashier',
  pago_procesado: 'payment_processed',
  finalizado: 'finalized',
  problema_demora: 'problem',
};

function App() {
  const [path, setPath] = useState(currentRoute());

  useEffect(() => {
    const redirected = sessionStorage.redirect;
    if (redirected) {
      delete sessionStorage.redirect;
      const url = new URL(redirected);
      history.replaceState(null, '', url.pathname + url.search);
      setPath(stripBasePath(url.pathname));
    }
    const onPop = () => setPath(currentRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (to) => {
    history.pushState(null, '', withBasePath(to));
    setPath(to);
  };

  if (path.startsWith('/caja')) return <StaffPanel mode="caja" navigate={navigate} />;
  if (path.startsWith('/tv') || path.startsWith('/monitor')) return <TvPanel navigate={navigate} />;
  if (path.startsWith('/marketing')) return <StaffPanel mode="marketing" navigate={navigate} />;
  return <ClientFlow navigate={navigate} />;
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('YakuExpress render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <Shell compact>
          <section className="panel">
            <h1>Error de la aplicacion</h1>
            <p className="error">{this.state.error.message || 'Se produjo un error inesperado.'}</p>
            <button onClick={() => { localStorage.removeItem('yakuexpress_draft'); location.href = withBasePath('/cliente'); }}>
              Reiniciar pedido
            </button>
          </section>
        </Shell>
      );
    }
    return this.props.children;
  }
}

function Shell({ children, compact = false }) {
  return (
    <main className="app-shell">
      <header className={`brand ${compact ? 'compact' : ''}`}>
        <div className="logo-slot">
          <Icon label="Y" />
          <div>
            <strong>Yakupark</strong>
            <span>YakuExpress</span>
          </div>
        </div>
        <div className="brand-pill">Pre-registro rapido por caja</div>
      </header>
      {children}
    </main>
  );
}

function ClientFlow({ navigate }) {
  const saved = normalizeDraft(readDraft());
  const [step, setStep] = useState(saved?.code ? 5 : 1);
  const [order, setOrder] = useState(saved || newDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dismissedUpsells, setDismissedUpsells] = useState({});
  const [scheduleNotice, setScheduleNotice] = useState('');
  const [recoverCode, setRecoverCode] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recoverMessage, setRecoverMessage] = useState('');

  const items = safeItems(order);
  const total = useMemo(() => calcTotal(order), [order]);
  const customerErrors = customerValidation(order);
  const completedSteps = {
    entries: items.every((item) => item.product_id),
    schedule: items.every((item) => item.slot),
    photos: Boolean(order.photoPack),
    details: validCustomer(order),
  };

  useEffect(() => saveDraft(order), [order]);

  const setItem = (index, patch) => {
    const nextItems = safeItems(order).map((item, i) => (i === index ? { ...item, ...patch } : item));
    setOrder({ ...order, items: nextItems });
  };

  const upgradeStandardEntry = (index) => {
    const current = safeItems(order)[index];
    const nextSlot = equivalentSlotForProduct(current?.slot, 'full_pass') || firstSlotForProduct('full_pass');
    setItem(index, { product_id: 'full_pass', slot: nextSlot });
    setScheduleNotice('Actualizamos el horario segun la duracion del Full Pass.');
  };

  const applySameSlot = (slot) => {
    const start = slotStart(slot);
    setOrder({
      ...order,
      sameSlot: true,
      items: safeItems(order).map((item) => ({ ...item, slot: equivalentSlotForProduct(start, item.product_id) || firstSlotForProduct(item.product_id) })),
    });
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const token = crypto.randomUUID();
      const payload = {
        p_receipt_type: order.receiptType,
        p_customer_name: order.customerName || null,
        p_document_number: order.documentNumber || null,
        p_email: order.email || null,
        p_phone: order.phone || null,
        p_comments: order.comments || null,
        p_payment_method: order.paymentMethod,
        p_photo_pack: order.photoPack,
        p_items: safeItems(order).map(({ product_id, slot }) => ({ product_id, slot })),
      };
      const { data, error: createError } = order.code
        ? await supabase.rpc('update_public_order', { p_code: order.code, p_edit_token: order.editToken, ...payload })
        : await supabase.rpc('create_public_order', { p_edit_token: token, ...payload });
      if (createError) throw createError;
      if (!data || typeof data !== 'object') {
        throw new Error('Supabase no devolvio datos del pedido. Revisa la funcion RPC create_public_order.');
      }
      if (!data.code) {
        throw new Error(`Respuesta RPC invalida: falta code. Respuesta: ${JSON.stringify(data)}`);
      }
      const created = { ...order, ...data, editToken: order.editToken || token, total: data.total };
      setOrder(created);
      saveDraft(created);
      await syncOrderToSheets(data.code);
      setStep(5);
    } catch (err) {
      console.error('YakuExpress submit error:', {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        raw: err,
        order,
      });
      setError(formatSupabaseError(err));
    } finally {
      setBusy(false);
    }
  };

  const recoverOrder = async () => {
    const code = normalizeOrderSearch(recoverCode);
    if (!code) {
      setRecoverMessage('Escribi tu codigo YAKU para recuperar el pedido.');
      return;
    }
    setRecovering(true);
    setRecoverMessage('');
    try {
      let result = await supabase.rpc('get_public_order_by_code', { p_code: code });
      if (result.error && /get_public_order_by_code|schema cache|function/i.test(result.error.message || '')) {
        result = await supabase.rpc('get_order_payload', { p_code: code });
      }
      if (result.error) throw result.error;
      if (!result.data?.code) {
        setRecoverMessage('No encontramos un pedido con ese código.');
        return;
      }
      const recovered = normalizeRecoveredOrder(result.data);
      setOrder(recovered);
      saveDraft(recovered);
      setStep(5);
      setRecoverCode('');
      setRecoverMessage(recovered.status === 'expired' ? 'Este pedido expiró. Podés crear uno nuevo.' : '');
    } catch (err) {
      console.error('YakuExpress section10 error:', err);
      setRecoverMessage('No pudimos recuperar el pedido. Revisa el codigo e intenta nuevamente.');
    } finally {
      setRecovering(false);
    }
  };

  if (step === 5) return <Confirmation order={order} setOrder={setOrder} setStep={setStep} navigate={navigate} />;

  return (
    <Shell>
      <section className="hero">
        <div>
          <p>YakuExpress</p>
          <h1>Compra rapida YakuExpress</h1>
          <span>Evitá filas y prepará tu ingreso a Yakupark en menos de 1 minuto.</span>
          <div className="hero-benefits">
            <b>Mas rapido en caja</b>
            <b>Reserva tu ingreso</b>
            <b>Agrega tus fotos del dia</b>
            <b>Disfruta mas tiempo</b>
          </div>
        </div>
        <Icon label="A" large />
      </section>

      <section className="client-intro">
        <div className="trust-strip">
          <strong>Seguro y rapido</strong>
          <span>Tu pedido se guarda automaticamente y podras mostrar tu codigo QR en caja.</span>
        </div>
        <div className="how-steps">
          <div><strong>1</strong><span>Elegi tus entradas</span></div>
          <div><strong>2</strong><span>Personaliza tu experiencia</span></div>
          <div><strong>3</strong><span>Mostra tu QR en caja</span></div>
        </div>
      </section>

      <RecoverOrderBox
        code={recoverCode}
        setCode={setRecoverCode}
        recover={recoverOrder}
        recovering={recovering}
        message={recoverMessage}
      />

      <Progress step={step} completedSteps={completedSteps} />
      <CompletionChecks completedSteps={completedSteps} />

      {step === 1 && (
        <section className="panel">
          <SectionTitle icon={<Icon label="1" />} title="Elegí tu experiencia" />
          <div className="conversion-note">
            <strong>La mayoría de visitantes elige Full Pass</strong>
            <span>para aprovechar mejor el parque, disfrutar con menos apuro y llevarse un recuerdo incluido.</span>
          </div>
          <div className="value-compare">
            <div>
              <span>Standard</span>
              <strong>45 min</strong>
            </div>
            <div className="featured">
              <span>Full Pass</span>
              <strong>90 min + 1 foto gratis + media incluida</strong>
            </div>
            <p>Por S/30 más duplicás tu tiempo y te llevás un recuerdo.</p>
          </div>
          <div className="product-grid">
            {items.map((item, index) => (
              <EntryPicker
                key={item.uid || `${item.product_id}-${index}`}
                item={item}
                index={index}
                canRemove={items.length > 1 && index > 0}
                setItem={setItem}
                remove={() => setOrder({ ...order, items: safeItems(order).filter((_, i) => i !== index) })}
              />
            ))}
          </div>
          <button className="ghost wide" onClick={() => setOrder({ ...order, items: [...safeItems(order), blankItem()] })}>
            + Agregar entrada
          </button>
          <div className="upsell-list">
            {items.map((item, index) => (
              item.product_id === 'standard' && !dismissedUpsells[item.uid || index] ? (
                <Upsell
                  key={item.uid || index}
                  entryNumber={index + 1}
                  onUpgrade={() => upgradeStandardEntry(index)}
                  onDismiss={() => setDismissedUpsells({ ...dismissedUpsells, [item.uid || index]: true })}
                />
              ) : null
            ))}
          </div>
          <Next onClick={() => setStep(2)} disabled={items.some((item) => !item.product_id)} />
        </section>
      )}

      {step === 2 && (
        <section className="panel">
          <SectionTitle icon={<Icon label="2" />} title="Elegí el mejor horario para disfrutar tu experiencia" />
          <p className="soft">Reservamos tu momento de ingreso para que todo se sienta mas fluido al llegar.</p>
          {scheduleNotice && <p className="schedule-notice">{scheduleNotice}</p>}
          {items.length > 1 && (
            <label className="check-row schedule-toggle">
              <input type="checkbox" checked={order.sameSlot} onChange={(e) => setOrder({ ...order, sameSlot: e.target.checked })} />
              <span>
                <strong>Mismo horario para todo el grupo</strong>
                <small>Ideal para familias o grupos que entran juntos.</small>
              </span>
            </label>
          )}
          {order.sameSlot ? (
            <div className="mini-panel schedule-card">
              <strong>Horario del grupo</strong>
              <small>Se respeta la duracion de cada entrada segun su producto.</small>
              <SlotChooser item={items[0]} value={items[0]?.slot || ''} onChange={applySameSlot} />
            </div>
          ) : (
            <>
              <p className="soft compact-help">Si tu grupo necesita moverse en tiempos distintos, podes ajustar cada entrada por separado.</p>
              {items.map((item, index) => (
                <div className="mini-panel schedule-card" key={item.uid || `${item.product_id}-${index}`}>
                  <strong>Entrada {index + 1}: {productById(item.product_id).name}</strong>
                  <SlotChooser item={item} value={item.slot} onChange={(slot) => setItem(index, { slot })} />
                </div>
              ))}
            </>
          )}
          <StepActions back={() => setStep(1)} next={() => setStep(3)} disabled={items.some((item) => !item.slot)} />
        </section>
      )}

      {step === 3 && (
        <section className="panel">
          <SectionTitle icon={<Icon label="3" />} title="Tus recuerdos dentro de Yakupark duran mas que el dia" />
          <p className="soft">Nuestros fotografos capturan tus mejores momentos dentro del parque para que te lleves un recuerdo inolvidable.</p>
          {items.some((item) => item.product_id === 'full_pass') && (
            <div className="photo-pass-note">
              <strong>Ya tenes 1 foto gratis incluida con tu Full Pass</strong>
              <span>Podes completar tu recuerdo agregando mas fotos de tu experiencia.</span>
            </div>
          )}
          <div className="photo-complete-note">
            <strong>Si querés quedarte con todo el día</strong>
            <span>Muchas familias prefieren llevarse todas para no elegir después qué recuerdo dejar fuera.</span>
          </div>
          <div className="option-grid">
            {photoPacks.map((pack) => (
              <button key={pack.id} className={`option-card ${order.photoPack === pack.id ? 'selected' : ''} ${pack.featured ? 'featured' : ''}`} onClick={() => setOrder({ ...order, photoPack: pack.id })}>
                {order.photoPack === pack.id && <span className="selected-check">OK</span>}
                {pack.badge && <span>{pack.badge}</span>}
                <strong>{pack.label}</strong>
                <b>{pack.price ? `S/${pack.price}` : 'S/0'}</b>
                <small>{pack.description}</small>
                {pack.microcopy && <em>{pack.microcopy}</em>}
              </button>
            ))}
          </div>
          <StepActions back={() => setStep(2)} next={() => setStep(4)} />
        </section>
      )}

      {step === 4 && (
        <section className="panel">
          <SectionTitle icon={<Icon label="4" />} title="Datos del responsable" />
          <p className="soft">Solo necesitamos los datos de una persona del grupo para preparar tu comprobante en caja.</p>
          <p className="trust-copy">Tus datos se usan unicamente para preparar tu pedido y agilizar la atencion.</p>
          <div className="receipt-grid">
            {['boleta', 'factura'].map((type) => (
              <button key={type} className={`receipt-card ${order.receiptType === type ? 'active' : ''}`} onClick={() => setOrder({ ...order, receiptType: type, customerName: '', documentNumber: '' })}>
                {order.receiptType === type && <span className="selected-check">OK</span>}
                <strong>{type === 'boleta' ? 'Boleta' : 'Factura'}</strong>
                <small>{type === 'boleta' ? 'Para personas naturales' : 'Para empresas o RUC'}</small>
              </button>
            ))}
          </div>
          <div className="form-section">
            <strong>Datos principales</strong>
            <div className="form-grid">
              <Field label={order.receiptType === 'boleta' ? 'Nombre completo' : 'Razon social'} placeholder={order.receiptType === 'boleta' ? 'Ej: Walter Cuenca' : 'Nombre de la empresa'} value={order.customerName} error={customerErrors.customerName} onChange={(v) => setOrder({ ...order, customerName: v })} />
              <Field label={order.receiptType === 'boleta' ? 'DNI' : 'RUC'} placeholder={order.receiptType === 'boleta' ? '8 digitos' : '11 digitos'} value={order.documentNumber} error={customerErrors.documentNumber} onChange={(v) => setOrder({ ...order, documentNumber: v.replace(/\D/g, '') })} inputMode="numeric" />
            </div>
          </div>
          <div className="form-section">
            <strong>Contacto</strong>
            <div className="form-grid">
              <Field label="Correo" placeholder={order.receiptType === 'boleta' ? 'tu correo' : 'correo para el comprobante'} value={order.email} error={customerErrors.email} onChange={(v) => setOrder({ ...order, email: v })} type="email" />
              <Field label="Telefono" placeholder="numero de contacto" value={order.phone} error={customerErrors.phone} onChange={(v) => setOrder({ ...order, phone: v.replace(/\D/g, '') })} inputMode="numeric" />
            </div>
          </div>
          <label className="field">
            <span>¿Querés decirnos algo para preparar mejor tu experiencia?</span>
            <textarea value={order.comments} placeholder="Ej: cumpleaños, grupo familiar, movilidad, detalle especial..." onChange={(e) => setOrder({ ...order, comments: e.target.value })} rows="3" />
            <small>Este campo es opcional.</small>
          </label>
          <p className="payment-note">El pago se realiza en caja</p>
          <div className="chips">
            {payMethods.map((method) => (
              <button key={method} className={order.paymentMethod === method ? 'chip active' : 'chip'} onClick={() => setOrder({ ...order, paymentMethod: method })}>
                {method}
              </button>
            ))}
          </div>
          <Summary order={order} total={total} />
          {error && <p className="error">{error}</p>}
          {busy && <PremiumLoading />}
          <StepActions back={() => setStep(3)} next={submit} disabled={!validCustomer(order) || busy} label={busy ? <LoadingLabel /> : 'Generar codigo y QR'} />
        </section>
      )}
      <MobileStickySummary order={order} total={total} step={step} />
    </Shell>
  );
}

function RecoverOrderBox({ code, setCode, recover, recovering, message }) {
  return (
    <section className="recover-card" aria-label="Recuperar pedido">
      <div>
        <strong>¿Ya tenés un código?</strong>
        <span>Si ya hiciste tu pedido, podés recuperar tu código QR acá.</span>
      </div>
      <div className="recover-form">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="YAKU-0001"
          aria-label="Codigo de pedido"
        />
        <button onClick={recover} disabled={recovering}>
          {recovering ? 'Recuperando...' : 'Recuperar pedido'}
        </button>
      </div>
      {message && <p className="recover-message">{message}</p>}
    </section>
  );
}

function EntryPicker({ item, index, canRemove, setItem, remove }) {
  return (
    <div className="entry">
      <div className="entry-head">
        <strong>Entrada {index + 1}</strong>
        {canRemove && <button className="ghost compact-button" onClick={remove}>Quitar</button>}
      </div>
      <div className="cards">
        {products.map((product) => (
          <button key={product.id} className={`product-card ${item.product_id === product.id ? 'selected' : ''} ${product.hero ? 'hero-card' : ''}`} onClick={() => setItem(index, { product_id: product.id, slot: '' })}>
            {item.product_id === product.id && <span className="selected-check">OK</span>}
            <div className="product-badges">
              {product.badge && <span className="badge">{product.badge}</span>}
              {product.secondBadge && <span className="badge second">{product.secondBadge}</span>}
            </div>
            <div className="product-title-row">
              <strong>{product.name}</strong>
              <b>S/{product.price}</b>
            </div>
            <small>{product.subtitle}</small>
            {product.note && <em>{product.note}</em>}
            <ul>{product.details.map((detail) => <li key={detail}>OK {detail}</li>)}</ul>
            {product.microcopy && <p className="product-microcopy">{product.microcopy}</p>}
          </button>
        ))}
      </div>
      {item.product_id === 'full_pass' && (
        <p className="choice-reinforcement">Excelente elección. Tenés más tiempo para disfrutar y 1 foto gratis incluida.</p>
      )}
    </div>
  );
}

function Upsell({ entryNumber, onUpgrade, onDismiss }) {
  return (
    <div className="upsell">
      <div className="upsell-badge">Recomendado</div>
      <div className="upsell-copy">
        <strong>Entrada {entryNumber}: Mejora tu experiencia</strong>
        <p>Si querés vivir la experiencia completa, Full Pass te da el doble de tiempo por solo S/30 más.</p>
        <ul>
          <li>90 minutos en vez de 45</li>
          <li>1 foto gratis incluida</li>
          <li>media de regalo</li>
          <li>mas tiempo para disfrutar sin apuro</li>
        </ul>
        <small>La mayoría de visitantes elige Full Pass para aprovechar mejor el parque.</small>
      </div>
      <div className="upsell-actions">
        <button onClick={onUpgrade}>Cambiar esta entrada a Full Pass</button>
        <button className="ghost" onClick={onDismiss}>No, continuar con Standard</button>
      </div>
    </div>
  );
}

function SlotChooser({ item, value, onChange }) {
  const product = productById(item.product_id);
  const slots = product.minutes === 90 ? longSlots : shortSlots;
  return (
    <>
      <div className="slot-meta">
        <span>Duracion: {product.minutes} minutos</span>
        <small>Horarios disponibles para esta entrada</small>
      </div>
      <div className="slots">
        {slots.map((slot) => (
          <button key={slot} className={value === slot ? 'slot active' : 'slot'} onClick={() => onChange(slot)}>
            {value === slot && <span className="slot-check">OK</span>}
            {formatSlot(slot)}
          </button>
        ))}
      </div>
    </>
  );
}

function Confirmation({ order, setOrder, setStep, navigate }) {
  const qrValue = `${location.origin}${withBasePath(`/caja?codigo=${order.code}`)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrValue)}`;
  const [now, setNow] = useState(Date.now());
  const [copyMessage, setCopyMessage] = useState('');
  const expiresAt = order.expires_at ? new Date(order.expires_at).getTime() : 0;
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : null;
  const expired = expiresAt ? remainingMs <= 0 : false;
  const countdown = remainingMs === null ? 'Sin vencimiento registrado' : formatCountdown(remainingMs);
  const status = order.status || (expired ? 'expired' : 'pending');

  useEffect(() => {
    if (!expiresAt || expired) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, expired]);

  const createNewOrder = () => {
    localStorage.removeItem('yakuexpress_draft');
    setOrder(newDraft());
    setStep(1);
  };

  const shareByWhatsApp = () => {
    const message = [
      '🌊 Tu pedido YakuExpress está listo',
      '',
      'Código:',
      order.code,
      '',
      'Mostrá este código o QR en caja para agilizar tu ingreso a Yakupark.',
      'Tu pedido vence en 1 hora.',
      '',
      '¡Nos vemos en Yakupark!',
    ].join('\n');
    const phone = whatsappPhone(order.phone);
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyCode = async () => {
    setCopyMessage('');
    try {
      await navigator.clipboard.writeText(order.code);
      setCopyMessage('Código copiado correctamente');
    } catch (err) {
      console.error('YakuExpress section10 error:', err);
      setCopyMessage(`No se pudo copiar automaticamente. Codigo: ${order.code}`);
    }
  };

  return (
    <Shell>
      <Progress step={5} completedSteps={{ entries: true, schedule: true, photos: true, details: true }} />
      <section className="done confirmation">
        {expired ? (
          <>
            <h1>Tu pedido expiro</h1>
            <p className="soft">El QR ya no esta disponible para caja. Crea un pedido nuevo para generar un codigo actualizado.</p>
            <button className="wide" onClick={createNewOrder}>Crear nuevo pedido</button>
          </>
        ) : (
          <>
            <div className="confirmation-head">
              <Icon label="OK" large />
              <div>
                <p className="success">Pedido generado correctamente</p>
                <h1>Mostrá este QR en caja</h1>
                <span>La persona de caja puede escanearlo o buscar el codigo YAKU manualmente.</span>
                {status && <small className={`order-status ${status}`}>Estado: {statusLabels[status] || status}</small>}
              </div>
            </div>

            <div className="qr-layout">
              <div className="qr-card">
                <div className="code-label">Codigo de pedido</div>
                <div className="code">{order.code}</div>
                <div className="qr"><img src={qrUrl} alt={`QR del pedido ${order.code}`} width="320" height="320" /></div>
                <p className="qr-hint">Manten esta pantalla abierta, con el codigo visible y el brillo alto.</p>
                <div className="share-actions">
                  <button onClick={shareByWhatsApp}>📲 Enviarme código por WhatsApp</button>
                  <button className="ghost" onClick={copyCode}>📋 Copiar código</button>
                </div>
                {copyMessage && <p className="copy-message">{copyMessage}</p>}
              </div>

              <div className="confirmation-side">
                <div className={`expiry-card ${remainingMs !== null && remainingMs <= 15 * 60 * 1000 ? 'urgent' : ''}`}>
                  <span>Tiempo para usar este QR</span>
                  <strong aria-live="polite">{countdown}</strong>
                  <small>Vence: {formatDate(order.expires_at)}</small>
                </div>

                <div className="cashier-instructions">
                  <strong>Instrucciones para caja</strong>
                  <ol>
                    <li>Escanear el QR o buscar el codigo {order.code}.</li>
                    <li>Revisar entradas, horario, fotos y total.</li>
                    <li>Cobrar y marcar el pedido como Pagado o En Fazzure.</li>
                  </ol>
                </div>

                <Summary order={order} total={order.total || calcTotal(order)} />
              </div>
            </div>

            <div className="actions">
              <button className="ghost edit-before-pay" onClick={() => setStep(1)}>Editar antes de pagar</button>
              <button className="ghost" onClick={createNewOrder}>Crear nuevo pedido</button>
              <button onClick={() => navigate('/caja')}>Ir a caja</button>
            </div>
          </>
        )}
      </section>
    </Shell>
  );
}

function StaffPanel({ mode, navigate }) {
  const [session, setSession] = useState(readSession());
  if (!session) return <Login mode={mode} setSession={setSession} navigate={navigate} />;
  if (mode === 'marketing') return <Marketing session={session} setSession={setSession} />;
  return <Caja session={session} setSession={setSession} />;
}

function Login({ mode, setSession, navigate }) {
  const [username, setUsername] = useState(mode === 'caja' ? 'caja' : 'admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const { data, error: loginError } = await supabase.rpc('staff_login', { p_username: username, p_password: password });
    if (loginError || !data?.ok) return setError('Usuario o password incorrecto.');
    const session = { token: data.session_token, role: data.role, username };
    localStorage.setItem('yakuexpress_staff', JSON.stringify(session));
    setSession(session);
  };
  return (
    <Shell compact>
      <form className="login panel" onSubmit={submit}>
        <Icon label="IN" large />
        <h1>{mode === 'caja' ? 'Panel Caja' : 'Panel Marketing'}</h1>
        <Field label="Usuario" value={username} onChange={setUsername} />
        <Field label="Password" value={password} onChange={setPassword} type="password" />
        {error && <p className="error">{error}</p>}
        <button>Entrar</button>
        <button type="button" className="ghost" onClick={() => navigate('/cliente')}>Volver a cliente</button>
      </form>
    </Shell>
  );
}

function Caja({ session, setSession }) {
  const [orders, setOrders] = useState([]);
  const [todayOrders, setTodayOrders] = useState([]);
  const [todayStatus, setTodayStatus] = useState('');
  const [now, setNow] = useState(Date.now());
  const [cashierSummary, setCashierSummary] = useState(null);
  const [query, setQuery] = useState(new URLSearchParams(location.search).get('codigo') || '');
  const [activeOrder, setActiveOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [todayMessage, setTodayMessage] = useState('');
  const [summaryMessage, setSummaryMessage] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('yaku_cashier_sound_enabled') === 'true');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioContextRef = useRef(null);
  const soundEnabledRef = useRef(soundEnabled);
  const audioUnlockedRef = useRef(audioUnlocked);
  const knownOrderStatusesRef = useRef(new Map());
  const playedSoundEventsRef = useRef(new Set());
  const didPrimeOrderStatusRef = useRef(false);
  const sortedTodayOrders = useMemo(() => sortOrdersByPriority(todayOrders, now), [todayOrders, now]);
  const visibleTodayOrders = useMemo(() => {
    if (!todayStatus) return sortedTodayOrders;
    return sortedTodayOrders.filter((order) => normalizeOperationalStatus(order.status) === todayStatus);
  }, [sortedTodayOrders, todayStatus]);
  const quickFilterCounts = useMemo(() => buildCashierFilterCounts(todayOrders), [todayOrders]);
  const waitingCustomerOrders = useMemo(() => waitingCustomers(todayOrders, now), [todayOrders, now]);
  const operationalStatus = useMemo(() => buildOperationalStatus(waitingCustomerOrders, now), [waitingCustomerOrders, now]);
  const smartOrderAlerts = useMemo(() => buildSmartOrderAlerts(waitingCustomerOrders, now), [waitingCustomerOrders, now]);
  const operationalRecommendations = useMemo(
    () => buildOperationalRecommendations(waitingCustomerOrders, operationalStatus),
    [waitingCustomerOrders, operationalStatus],
  );

  const logCajaProError = (scope, error, extra = {}) => {
    console.error('YakuExpress fase2 caja pro error:', {
      scope,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      raw: error,
      ...extra,
    });
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('yaku_cashier_sound_enabled', soundEnabled ? 'true' : 'false');
    soundEnabledRef.current = soundEnabled;
    console.log('Sound enabled', soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    audioUnlockedRef.current = audioUnlocked;
  }, [audioUnlocked]);

  const unlockCashierAudio = async () => {
    try {
      await ensureCashierAudio(audioContextRef);
      audioUnlockedRef.current = true;
      setAudioUnlocked(true);
      return true;
    } catch (error) {
      console.warn('YakuExpress cashier audio unavailable:', error);
      setAudioUnlocked(false);
      return false;
    }
  };

  const playOrderSoundOnce = (order, eventType) => {
    const orderKey = orderIdentifier(order);
    if (!orderKey || !eventType || !soundEnabledRef.current || !audioUnlockedRef.current) return;
    const eventKey = `${orderKey}:${eventType}`;
    if (playedSoundEventsRef.current.has(eventKey)) return;
    playedSoundEventsRef.current.add(eventKey);
    if (eventType === 'new_order') console.log('Playing new order sound', orderKey);
    playCashierSound(eventType, audioContextRef);
  };

  const primeAndPlayOrderEvents = (nextOrders) => {
    const previousStatuses = knownOrderStatusesRef.current;
    const nextStatuses = new Map();
    nextOrders.forEach((order) => {
      const orderKey = orderIdentifier(order);
      if (!orderKey) return;
      const status = normalizeOperationalStatus(order.status);
      nextStatuses.set(orderKey, status);
      if (!didPrimeOrderStatusRef.current) return;
      const previousStatus = previousStatuses.get(orderKey);
      if (!previousStatus && status === 'pedido_creado') {
        console.log('New order detected', { orderKey, code: order.code, id: order.id });
        playOrderSoundOnce(order, 'new_order');
        return;
      }
      if (previousStatus && previousStatus !== status) {
        playOrderSoundOnce(order, soundEventByStatus[status]);
      }
    });
    knownOrderStatusesRef.current = nextStatuses;
    if (!didPrimeOrderStatusRef.current) console.log('Initial orders loaded', nextStatuses.size);
    didPrimeOrderStatusRef.current = true;
  };

  const loadSummary = async () => {
    setSummaryLoading(true);
    setSummaryMessage('Cargando resumen...');
    try {
      const { data, error } = await supabase.rpc('staff_cashier_summary_today', {
        p_session_token: session.token,
      });
      if (error) throw error;
      setCashierSummary(data || {});
      setSummaryMessage('');
    } catch (error) {
      logCajaProError('caja.summary', error);
      setCashierSummary(null);
      setSummaryMessage(`Error suave al actualizar resumen: ${formatSupabaseError(error)}`);
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadToday = async () => {
    setTodayLoading(true);
    setTodayMessage('Cargando pedidos de hoy...');
    try {
      const { data, error } = await supabase.rpc('staff_list_today_orders', {
        p_session_token: session.token,
        p_status: null,
      });
      if (error) throw error;
      const nextOrders = Array.isArray(data) ? data.filter(Boolean) : [];
      primeAndPlayOrderEvents(nextOrders);
      setTodayOrders(nextOrders);
      setTodayMessage(nextOrders.length ? '' : 'No hay pedidos registrados hoy.');
    } catch (error) {
      logCajaProError('caja.todayOrders', error);
      setTodayOrders([]);
      setTodayMessage(`Error suave al cargar pedidos de hoy: ${formatSupabaseError(error)}`);
    } finally {
      setTodayLoading(false);
    }
  };

  const refreshCaja = async () => {
    await Promise.all([loadSummary(), loadToday()]);
  };

  const load = async () => {
    setLoading(true);
    setSearchMessage('Buscando pedido...');
    try {
      const normalizedQuery = normalizeOrderSearch(query);
      if (!normalizedQuery) {
        setOrders([]);
        setSearchMessage('Ingresa codigo, nombre, DNI/RUC o telefono.');
        return;
      }
      const { data, error } = await supabase.rpc('staff_search_orders', {
        p_session_token: session.token,
        p_query: normalizedQuery,
      });
      if (error) throw error;
      const nextOrders = Array.isArray(data) ? data.filter(Boolean) : [];
      setOrders(nextOrders);
      if (nextOrders.length === 1) {
        selectOrder(nextOrders[0]);
        setSearchMessage('Pedido encontrado.');
      } else if (nextOrders.length > 1) {
        setSearchMessage(`${nextOrders.length} pedidos encontrados.`);
      } else {
        setSearchMessage('No encontramos pedidos con ese dato.');
      }
    } catch (error) {
      logCajaProError('caja.search', error, { query });
      setOrders([]);
      setSearchMessage(`Error al buscar pedido: ${formatSupabaseError(error)}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refreshCaja('');
    if (query) load();
    const timer = window.setInterval(() => refreshCaja(), 10000);
    return () => window.clearInterval(timer);
  }, []);

  const selectOrder = (order) => {
    if (!order?.code) return;
    setActiveOrder(order);
  };

  const closeSelectedOrder = () => {
    setActiveOrder(null);
  };

  const handleOrderUpdated = (updatedOrder) => {
    if (!updatedOrder?.code) return;
    if (normalizeOperationalStatus(updatedOrder.status) === 'finalizado') {
      closeSelectedOrder();
      return;
    }
    setActiveOrder(updatedOrder);
  };

  const updateStatus = async (code, status) => {
    let { data, error } = await supabase.rpc('staff_update_order_status', {
      p_session_token: session.token,
      p_code: code,
      p_status: status,
    });
    if (error && legacyStatusFallbacks[status] && /enum|order_status|invalid input value/i.test(`${error.message || ''} ${error.details || ''}`)) {
      ({ data, error } = await supabase.rpc('staff_update_order_status', {
        p_session_token: session.token,
        p_code: code,
        p_status: legacyStatusFallbacks[status],
      }));
      if (data?.code) data = { ...data, status };
    }
    if (error) throw error;
    playOrderSoundOnce({ code }, soundEventByStatus[normalizeOperationalStatus(data?.status || status)]);
    await syncOrderToSheets(code);
    await load();
    await refreshCaja();
    return data;
  };

  const runWaitingCustomerAction = async (event, order, status) => {
    event.stopPropagation();
    setTodayMessage('');
    try {
      await updateStatus(order.code, status);
    } catch (error) {
      logCajaProError('caja.waitingCustomersAction', error, { code: order.code, status });
      setTodayMessage(`Error al actualizar ${order.code}: ${formatSupabaseError(error)}`);
    }
  };

  const runTodayExpressAction = async (event, order, status) => {
    event.stopPropagation();
    setTodayMessage('');
    try {
      await updateStatus(order.code, status);
    } catch (error) {
      logCajaProError('caja.todayExpressAction', error, { code: order.code, status });
      setTodayMessage(`Error al actualizar ${order.code}: ${formatSupabaseError(error)}`);
    }
  };

  return (
    <Shell compact>
      <section className="panel staff">
        <StaffHeader title="Caja" session={session} setSession={setSession} />
        <div className="staff-head">
          <h2>Resumen de caja hoy</h2>
          <small>Actualizacion automatica cada 10s</small>
        </div>
        {summaryMessage && <p className={summaryMessage.startsWith('Error') ? 'error' : 'soft'}>{summaryMessage}</p>}
        <div className="kpi-grid">
          {[
            ['Pedidos', cashierSummary?.total_orders ?? todayOrders.length ?? 0, 'neutral'],
            ['Creados', cashierSummary?.pedido_creado_orders ?? cashierSummary?.pending_orders ?? countOrdersByStatus(todayOrders, 'pedido_creado'), 'pedido_creado'],
            ['En caja', cashierSummary?.cliente_en_caja_orders ?? countOrdersByStatus(todayOrders, 'cliente_en_caja'), 'cliente_en_caja'],
            ['Pagos', cashierSummary?.pago_procesado_orders ?? cashierSummary?.paid_orders ?? countOrdersByStatus(todayOrders, 'pago_procesado'), 'pago_procesado'],
            ['Finalizados', cashierSummary?.finalizado_orders ?? cashierSummary?.in_fazzure_orders ?? countOrdersByStatus(todayOrders, 'finalizado'), 'finalizado'],
            ['Problemas', cashierSummary?.problema_demora_orders ?? cashierSummary?.cancelled_orders ?? countOrdersByStatus(todayOrders, 'problema_demora'), 'problema_demora'],
            ['Total', `S/${cashierSummary?.total_sales ?? 0}`, 'paid'],
            ['Ticket promedio', `S/${cashierSummary?.avg_ticket ?? 0}`, 'neutral'],
          ].map(([label, value, tone]) => (
            <div key={label} className={`kpi ${tone}`}>
              <span>{label}</span>
              <strong>{summaryLoading ? '...' : value}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className={`panel staff operational-panel ${operationalStatus.tone}`}>
        <div className="operational-head">
          <div>
            <span>Estado operativo</span>
            <h2>{operationalStatus.icon} {operationalStatus.label}</h2>
          </div>
          <strong>{operationalStatus.averageWaitMinutes} min</strong>
        </div>
        <div className="operational-metrics">
          <div>
            <span>Clientes esperando</span>
            <strong>{operationalStatus.waitingCount}</strong>
          </div>
          <div>
            <span>Pedidos en atencion</span>
            <strong>{operationalStatus.attentionCount}</strong>
          </div>
          <div>
            <span>Urgentes / criticos</span>
            <strong>{operationalStatus.urgentCriticalCount}</strong>
          </div>
          <div>
            <span>Espera promedio</span>
            <strong>{operationalStatus.averageWaitMinutes} min</strong>
          </div>
        </div>
        <div className="alert-center" aria-label="Centro de alertas">
          {operationalStatus.alerts.map((alert) => (
            <span key={alert}>{alert}</span>
          ))}
        </div>
        <div className="smart-alerts" aria-label="Alertas inteligentes">
          <div className="smart-alerts-head">
            <strong>Alertas inteligentes</strong>
            <small>{smartOrderAlerts.length ? `${smartOrderAlerts.length} activas` : 'Operacion estable'}</small>
          </div>
          <div className="smart-alert-list">
            {smartOrderAlerts.length ? smartOrderAlerts.slice(0, 5).map((alert) => (
              <span key={alert.key} className={`smart-alert ${alert.tone}`}>
                {alert.message}
              </span>
            )) : (
              <span className="smart-alert neutral">Sin alertas criticas por ahora</span>
            )}
          </div>
        </div>
        <div className="operational-recommendations" aria-label="Recomendaciones operativas">
          <div className="smart-alerts-head">
            <strong>Recomendaciones operativas</strong>
            <small>{operationalRecommendations.length} sugerencias</small>
          </div>
          <div className="recommendation-list">
            {operationalRecommendations.slice(0, 3).map((recommendation) => (
              <span key={recommendation.key} className={`recommendation ${recommendation.tone}`}>
                {recommendation.message}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section className="panel staff waiting-customers-panel">
        <div className="staff-head waiting-customers-head">
          <div>
            <h2>Clientes esperando</h2>
            <small>Clientes esperando: {waitingCustomerOrders.length}</small>
          </div>
          <span className="waiting-count">{waitingCustomerOrders.length}</span>
        </div>
        {waitingCustomerOrders.length ? (
          <div className="waiting-list">
            {waitingCustomerOrders.map((order) => {
              const priority = orderPriority(order, now);
              const status = normalizeOperationalStatus(order.status);
              return (
                <article key={order.code} className={`waiting-row priority-${priority.tone} ${statusToneClass(order.status)}`}>
                  <button className="waiting-main" onClick={() => selectOrder(order)}>
                    <div className="waiting-code">
                      <strong>{order.code}</strong>
                      <span>{order.customer_name || '-'}</span>
                    </div>
                    <OrderTimeMeta order={order} now={now} priority={priority} />
                    <div className="waiting-badges">
                      <OrderStatusBadge status={order.status} />
                      <OrderPriorityBadge priority={priority} />
                    </div>
                  </button>
                  <div className="waiting-actions">
                    {status === 'cliente_en_caja' && (
                      <button className="status pago_procesado compact-button" onClick={(event) => runWaitingCustomerAction(event, order, 'pago_procesado')}>
                        Pago procesado
                      </button>
                    )}
                    {status === 'pago_procesado' && (
                      <button className="status finalizado compact-button" onClick={(event) => runWaitingCustomerAction(event, order, 'finalizado')}>
                        Finalizar
                      </button>
                    )}
                    {status !== 'problema_demora' && (
                      <button className="status problema_demora compact-button" onClick={(event) => runWaitingCustomerAction(event, order, 'problema_demora')}>
                        Marcar problema
                      </button>
                    )}
                    {status === 'problema_demora' && (
                      <button className="status finalizado compact-button" onClick={(event) => runWaitingCustomerAction(event, order, 'finalizado')}>
                        Finalizar
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="soft">Todavia no hay clientes marcados como presentes en caja.</p>
        )}
      </section>
      <section className="panel staff">
        <div className="staff-head">
          <h2>Pedidos de hoy</h2>
          <div className="cashier-tools">
            <div className={`sound-control ${soundEnabled && audioUnlocked ? 'active' : ''}`}>
              <button
                className="ghost"
                onClick={async () => {
                  if (soundEnabled && audioUnlocked) {
                    setSoundEnabled(false);
                    return;
                  }
                  setSoundEnabled(true);
                  const unlocked = await unlockCashierAudio();
                  if (unlocked) playCashierSound('enabled', audioContextRef);
                }}
              >
                {soundEnabled && audioUnlocked ? 'Desactivar sonidos' : 'Activar sonidos de caja'}
              </button>
              <span>{soundEnabled && audioUnlocked ? 'Sonido activado' : 'Sonido desactivado'}</span>
            </div>
            <button className="ghost" onClick={() => refreshCaja()} disabled={todayLoading || summaryLoading}>
              {todayLoading ? 'Actualizando...' : 'Actualizar pedidos de hoy'}
            </button>
            <button className="ghost tv-open-button" onClick={() => window.open(withBasePath('/tv'), '_blank', 'noopener,noreferrer')}>
              Abrir Modo TV
            </button>
          </div>
        </div>
        <small className="soft">Actualizacion automatica cada 10s</small>
        <div className="express-summary" aria-label="Resumen rapido de caja">
          {[
            ['Pendientes', quickFilterCounts.pedido_creado, 'pedido_creado'],
            ['En caja', quickFilterCounts.cliente_en_caja, 'cliente_en_caja'],
            ['Pagados', quickFilterCounts.pago_procesado, 'pago_procesado'],
            ['Problemas', quickFilterCounts.problema_demora, 'problema_demora'],
          ].map(([label, value, tone]) => (
            <span key={label} className={`express-summary-chip ${tone}`}>
              {label}: <b>{value}</b>
            </span>
          ))}
        </div>
        <div className="chips quick-filter-bar" aria-label="Filtros rapidos">
          {cashierStatusFilters.map(([status, label]) => (
            <button
              key={label}
              className={todayStatus === status ? 'chip active quick-filter' : 'chip quick-filter'}
              onClick={() => setTodayStatus(status)}
              disabled={todayLoading}
            >
              {label} <span>{quickFilterCounts[status || 'all'] ?? 0}</span>
            </button>
          ))}
        </div>
        {todayMessage && <p className={todayMessage.startsWith('Error') ? 'error' : 'soft'}>{todayMessage}</p>}
        <div className="today-list">
          {visibleTodayOrders.map((order) => {
            const priority = orderPriority(order, now);
            const expressActions = expressActionsForOrder(order);
            return (
            <article key={order.code} className={`today-row express-order-row ${statusToneClass(order.status)} priority-${priority.tone}`}>
              <button className="today-row-main" onClick={() => selectOrder(order)}>
                <div className="today-code">
                  <strong>{order.code}</strong>
                  <OrderStatusBadge status={order.status} />
                  <OrderPriorityBadge priority={priority} />
                </div>
                <span>{order.customer_name || '-'}</span>
                <span>{order.payment_method || '-'}</span>
                <b>S/{order.total || 0}</b>
                <OrderTimeMeta order={order} now={now} priority={priority} />
              </button>
              <div className="express-actions">
                {expressActions.map(([status, label]) => (
                  <button key={status} className={`status ${status} compact-button`} onClick={(event) => runTodayExpressAction(event, order, status)}>
                    {label}
                  </button>
                ))}
                <button className="ghost compact-button" onClick={() => selectOrder(order)}>Ver</button>
              </div>
            </article>
            );
          })}
        </div>
      </section>
      <section className="panel staff">
        <h2>Busqueda inteligente</h2>
        <div className="searchbar">
          <span className="search-icon">Buscar</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Codigo, nombre, DNI/RUC o telefono" />
          <button onClick={load} disabled={loading}>{loading ? 'Buscando...' : 'Actualizar'}</button>
        </div>
        {searchMessage && <p className={searchMessage.startsWith('Error') ? 'error' : 'soft'}>{searchMessage}</p>}
        <div className="table-list">
          {orders.map((order) => (
            <article key={order.code} className="order-row">
              <div>
                <div className="order-title-line">
                  <strong>{order.code}</strong>
                  <OrderStatusBadge status={order.status} />
                  <OrderPriorityBadge priority={orderPriority(order, now)} />
                </div>
                <span>{order.customer_name} · {order.document_number}</span>
                <small>{order.phone} · vence {formatDate(order.expires_at)}</small>
              </div>
              <b>S/{order.total}</b>
              <button className="ghost" onClick={() => selectOrder(order)}>Ver / editar</button>
            </article>
          ))}
        </div>
      </section>
        {activeOrder && (
          <OrderModal
            order={activeOrder}
            session={session}
            close={closeSelectedOrder}
            updateStatus={updateStatus}
            onOrderUpdated={handleOrderUpdated}
            refresh={async () => { await load(); await refreshCaja(); }}
          />
        )}
    </Shell>
  );
}

function TvPanel({ navigate }) {
  const [session, setSession] = useState(readSession());
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [highlightedTvOrders, setHighlightedTvOrders] = useState(() => new Set());
  const knownTvOrderStatesRef = useRef(new Map());
  const didPrimeTvOrdersRef = useRef(false);
  const highlightTimersRef = useRef(new Map());

  const activeOrders = useMemo(() => waitingCustomers(orders, now), [orders, now]);
  const createdOrders = useMemo(() => (
    orders
      .filter((order) => normalizeOperationalStatus(order.status) === 'pedido_creado')
      .sort((a, b) => timestampValue(b.created_at) - timestampValue(a.created_at))
  ), [orders]);
  const operationalStatus = useMemo(() => buildOperationalStatus(activeOrders, now), [activeOrders, now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    highlightTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    highlightTimersRef.current.clear();
  }, []);

  const highlightTvOrder = (order) => {
    const orderKey = orderIdentifier(order);
    if (!orderKey) return;
    if (highlightTimersRef.current.has(orderKey)) window.clearTimeout(highlightTimersRef.current.get(orderKey));
    setHighlightedTvOrders((current) => {
      const next = new Set(current);
      next.add(orderKey);
      return next;
    });
    const timer = window.setTimeout(() => {
      setHighlightedTvOrders((current) => {
        const next = new Set(current);
        next.delete(orderKey);
        return next;
      });
      highlightTimersRef.current.delete(orderKey);
    }, 4500);
    highlightTimersRef.current.set(orderKey, timer);
  };

  const trackTvOrderChanges = (nextOrders) => {
    const previousStates = knownTvOrderStatesRef.current;
    const nextStates = new Map();
    nextOrders.forEach((order) => {
      const orderKey = orderIdentifier(order);
      if (!orderKey) return;
      const status = normalizeOperationalStatus(order.status);
      nextStates.set(orderKey, status);
      if (!didPrimeTvOrdersRef.current) return;
      const previousStatus = previousStates.get(orderKey);
      if (!previousStatus && status === 'pedido_creado') highlightTvOrder(order);
      if (previousStatus === 'pedido_creado' && isWaitingCustomerOrder(order)) highlightTvOrder(order);
    });
    knownTvOrderStatesRef.current = nextStates;
    didPrimeTvOrdersRef.current = true;
  };

  useEffect(() => {
    if (!session?.token) return undefined;
    const loadTvOrders = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('staff_list_today_orders', {
          p_session_token: session.token,
          p_status: null,
        });
        if (error) throw error;
        const nextOrders = Array.isArray(data) ? data.filter(Boolean) : [];
        trackTvOrderChanges(nextOrders);
        setOrders(nextOrders);
        setMessage('');
      } catch (error) {
        console.error('YakuExpress modo TV error:', {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
          raw: error,
        });
        setOrders([]);
        setMessage(`No pudimos cargar el modo TV: ${formatSupabaseError(error)}`);
      } finally {
        setLoading(false);
      }
    };
    loadTvOrders();
    const timer = window.setInterval(loadTvOrders, 10000);
    return () => window.clearInterval(timer);
  }, [session?.token]);

  if (!session) return <Login mode="caja" setSession={setSession} navigate={navigate} />;

  return (
    <main className={`tv-shell ${operationalStatus.tone}`}>
      <header className="tv-header">
        <div>
          <span>YAKUEXPRESS</span>
          <h1>Centro de pedidos</h1>
        </div>
        <div className="tv-status">
          <strong>{formatClock(now)}</strong>
          <b><span>{operationalStatus.icon}</span> {formatOperationalTone(operationalStatus.tone)}</b>
        </div>
      </header>

      <section className="tv-metrics" aria-label="Metricas de operacion">
        <div><span>Clientes esperando</span><strong>{operationalStatus.waitingCount}</strong></div>
        <div><span>Urgentes / criticos</span><strong>{operationalStatus.urgentCriticalCount}</strong></div>
        <div><span>Espera promedio</span><strong>{operationalStatus.averageWaitMinutes} min</strong></div>
      </section>

      {message && <p className="tv-message">{message}</p>}

      <section className="tv-layout">
        <div className="tv-main-panel">
          <div className="tv-section-head">
            <h2>Clientes esperando</h2>
            <span>{loading ? 'Actualizando...' : 'En vivo'}</span>
          </div>
          <div className="tv-order-grid">
            {activeOrders.length ? activeOrders.map((order) => {
              const priority = orderPriority(order, now);
              const isHighlighted = highlightedTvOrders.has(orderIdentifier(order));
              return (
                <article key={order.code} className={`tv-order-card priority-${priority.tone} ${statusToneClass(order.status)} ${isHighlighted ? 'is-new' : ''}`}>
                  <div className="tv-order-top">
                    <strong>{order.code}</strong>
                    <OrderPriorityBadge priority={priority} />
                  </div>
                  <h3>{order.customer_name || '-'}</h3>
                  <div className="tv-order-badges">
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <b>{formatActiveDuration(priority.waitStartedAt, now)}</b>
                  <small>{priority.waitLabel}</small>
                </article>
              );
            }) : (
              <div className="tv-empty">
                <strong>Sin clientes activos</strong>
                <span>Los pedidos apareceran cuando caja marque Cliente en caja.</span>
              </div>
            )}
          </div>
        </div>

        <aside className="tv-side-panel">
          <section className="tv-created-panel">
            <span>Pedidos creados por atender</span>
            {createdOrders.length ? (
              <div className="tv-created-list">
                {createdOrders.slice(0, 8).map((order) => (
                  <strong key={order.code || order.id} className={highlightedTvOrders.has(orderIdentifier(order)) ? 'is-new' : ''}>
                    {formatTvOrderCode(order)}
                  </strong>
                ))}
              </div>
            ) : (
              <p>No hay pedidos pendientes por atender</p>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

function OrderModal({ order, session, close, updateStatus, refresh, onOrderUpdated }) {
  const [now, setNow] = useState(Date.now());
  const [form, setForm] = useState({
    customer_name: order.customer_name || '',
    document_number: order.document_number || '',
    phone: order.phone || '',
    email: order.email || '',
    payment_method: order.payment_method || 'Yape',
    comments: order.comments || '',
  });
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [chargingMethod, setChargingMethod] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const runAction = async (action, options = {}) => {
    setSaving(true);
    setActionMessage('');
    setActionError('');
    try {
      const updatedOrder = await action();
      const updatedStatus = normalizeOperationalStatus(updatedOrder?.status);
      await refresh();
      if (options.closeOnFinalized || updatedStatus === 'finalizado') {
        close();
        return;
      }
      if (updatedOrder?.code) onOrderUpdated?.(updatedOrder);
      setActionMessage((current) => current || 'Pedido actualizado correctamente');
    } catch (error) {
      console.error('YakuExpress fase2 caja pro error:', {
        scope: 'caja.orderAction',
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        raw: error,
        order,
        form,
      });
      setActionError(`Error al actualizar pedido: ${formatSupabaseError(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const { data, error } = await supabase.rpc('staff_update_order_details', {
      p_session_token: session.token,
      p_code: order.code,
      p_customer_name: form.customer_name,
      p_document_number: form.document_number,
      p_email: form.email,
      p_phone: form.phone,
      p_comments: form.comments,
      p_payment_method: form.payment_method,
    });
    if (error) throw error;
    await syncOrderToSheets(order.code);
    return data;
  };

  const quickCharge = async (method) => {
    setChargingMethod(method);
    try {
      const { data, error } = await supabase.rpc('staff_quick_charge', {
        p_session_token: session.token,
        p_code: order.code,
        p_payment_method: method,
      });
      if (error) throw error;
      await syncOrderToSheets(order.code);
      setForm({ ...form, payment_method: method });
      setActionMessage(`Pedido marcado como pagado con ${method}`);
      return data;
    } finally {
      setChargingMethod('');
    }
  };
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <button type="button" className="icon-button close" onClick={close} aria-label="Cerrar pedido">X</button>
        <div className="modal-order-head">
          <div>
            <h2>{order.code}</h2>
            <OrderTimeMeta order={order} now={now} priority={orderPriority(order, now)} />
          </div>
          <div className="modal-badges">
            <OrderStatusBadge status={order.status} />
            <OrderPriorityBadge priority={orderPriority(order, now)} />
          </div>
        </div>
        <div className="form-grid">
          <Field label="Cliente" value={form.customer_name} onChange={(v) => setForm({ ...form, customer_name: v })} />
          <Field label="DNI/RUC" value={form.document_number} onChange={(v) => setForm({ ...form, document_number: v.replace(/\D/g, '') })} inputMode="numeric" />
          <Field label="Telefono" value={form.phone} onChange={(v) => setForm({ ...form, phone: v.replace(/\D/g, '') })} inputMode="tel" />
          <Field label="Correo" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
        </div>
        <div className="chips">
          {payMethods.map((method) => (
            <button key={method} className={form.payment_method === method ? 'chip active' : 'chip'} onClick={() => setForm({ ...form, payment_method: method })}>
              {method}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Comentarios</span>
          <textarea value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} rows="3" />
        </label>
        <div className="detail-box">
          {(order.items || []).map((item, index) => <span key={index}>{productById(item.product_id).name} - {item.slot}</span>)}
          <span>Fotos: {photoLabel(order.photo_pack)}</span>
          <span>Comprobante: {order.receipt_type}</span>
          <strong>Total: S/{order.total}</strong>
        </div>
        {actionMessage && <p className="success">{actionMessage}</p>}
        {actionError && <p className="error">{actionError}</p>}
        <div className="quick-charge">
          <strong>Cobro rapido</strong>
          <div className="quick-grid">
            {['Efectivo', 'Yape', 'Plin', 'Tarjeta'].map((method) => (
              <button key={method} disabled={saving || Boolean(chargingMethod)} onClick={() => runAction(() => quickCharge(method))}>
                {chargingMethod === method ? 'Cobrando...' : `Cobrar ${method.toLowerCase()}`}
              </button>
            ))}
          </div>
        </div>
        <button className="wide" onClick={() => runAction(save)} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
        <div className="status-grid">
          {cashierStatusActions.map(([status, label]) => (
            <button key={status} className={`status ${status}`} disabled={saving} onClick={() => runAction(() => updateStatus(order.code, status), { closeOnFinalized: status === 'finalizado' })}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Marketing({ session, setSession }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => {
    setLoading(true);
    setMessage('Cargando metricas de hoy...');
    try {
      const { data, error } = await supabase.rpc('staff_daily_report', { p_session_token: session.token });
      if (error) throw error;
      setStats(data || null);
      setMessage(data?.total_orders ? '' : 'Todavia no hay datos registrados hoy.');
    } catch (error) {
      console.error('YakuExpress phase1 error:', {
        scope: 'marketing.dailyReport',
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        raw: error,
      });
      setStats(null);
      setMessage(`Error al cargar marketing: ${formatSupabaseError(error)}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const summaryCards = stats ? [
    ['Pedidos totales', stats.total_orders],
    ['Entradas vendidas', stats.entries_sold],
    ['Full Pass vendidos', stats.full_pass],
    ['Standard vendidos', stats.standard],
    ['Premium Kids vendidos', stats.premium_kids],
    ['Kids Normal vendidos', stats.kids_normal],
    ['Ticket promedio', `S/${stats.average_ticket}`],
    ['Total estimado', `S/${stats.estimated_total}`],
  ] : [];
  const conversionCards = stats ? [
    ['Fotos vendidas / packs', stats.photo_packs],
    ['Pedidos con fotos', `${stats.photo_percentage}%`],
    ['Conversion Full Pass', `${stats.full_pass_conversion ?? stats.premium_conversion}%`],
    ['Metodo top', stats.top_payment_method || '-'],
    ['Horario top', stats.top_slot || '-'],
  ] : [];
  return (
    <Shell compact>
      <section className="panel staff">
        <StaffHeader title="Marketing en vivo" session={session} setSession={setSession} />
        <button className="ghost" onClick={load} disabled={loading}>{loading ? 'Actualizando...' : 'Actualizar'}</button>
        {message && <p className={message.startsWith('Error') ? 'error' : 'soft'}>{message}</p>}
        <h2>Resumen del dia</h2>
        <div className="metric-grid">
          {summaryCards.map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
        <h2>Conversion y fotografia</h2>
        <div className="metric-grid">
          {conversionCards.map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </section>
    </Shell>
  );
}

function StaffHeader({ title, session, setSession }) {
  return (
    <div className="staff-head">
      <h1>{title}</h1>
      <button className="ghost" onClick={() => { localStorage.removeItem('yakuexpress_staff'); setSession(null); }}>Salir</button>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return <div className="section-title">{icon}<h2>{title}</h2></div>;
}

function Icon({ label, large = false }) {
  return <span className={`app-icon ${large ? 'large' : ''}`} aria-hidden="true">{label}</span>;
}

function Field({ label, value, onChange, type = 'text', inputMode, placeholder = '', error = '' }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span>{label}</span>
      <input type={type} inputMode={inputMode} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <small>{error}</small>}
    </label>
  );
}

function OrderStatusBadge({ status }) {
  const meta = statusMeta(status);
  return <span className={`order-state-badge ${meta.tone}`}>{meta.label}</span>;
}

function OrderPriorityBadge({ priority }) {
  return <span className={`priority-badge ${priority.tone}`}>{priority.label}</span>;
}

function OrderTimeMeta({ order, now, priority = orderPriority(order, now) }) {
  return (
    <small className="order-time-meta">
      <span>Creado {formatTime(order.created_at)}</span>
      <b>{priority.waitLabel}: {formatActiveDuration(priority.waitStartedAt, now)}</b>
    </small>
  );
}

function Summary({ order, total }) {
  const grouped = safeItems(order).reduce((acc, item) => ({ ...acc, [item.product_id]: (acc[item.product_id] || 0) + 1 }), {});
  return (
    <div className="summary">
      <strong>Resumen</strong>
      {Object.entries(grouped).map(([id, qty]) => <span key={id}>{qty} {productById(id).name} - S/{qty * productById(id).price}</span>)}
      <span>Fotos - S/{photoPrice(order.photoPack || order.photo_pack)}</span>
      {orderHasFullPass(order) && <small className="summary-insight">Tu pedido incluye experiencia premium.</small>}
      {orderHasFullPass(order) && orderHasAllPhotos(order) && <small className="summary-insight">También incluye el recuerdo completo del día.</small>}
      <b>TOTAL: S/{total}</b>
    </div>
  );
}

function StepActions({ back, next, disabled, label = 'Continuar' }) {
  return <div className="actions"><button className="ghost" onClick={back}>Atras</button><button onClick={next} disabled={disabled}>{label}</button></div>;
}
function Next({ onClick, disabled }) { return <button className="wide" onClick={onClick} disabled={disabled}>Continuar</button>; }
function Progress({ step, completedSteps = {} }) {
  const steps = [
    ['entries', 'Entradas'],
    ['schedule', 'Horarios'],
    ['photos', 'Fotos'],
    ['details', 'Datos'],
    ['confirmation', 'Confirmacion'],
  ];
  return (
    <nav className="progress stepper" aria-label="Progreso del pedido">
      {steps.map(([id, label], index) => {
        const number = index + 1;
        const complete = id === 'confirmation' ? step === 5 : completedSteps[id];
        return (
          <div key={id} className={`stepper-item ${step === number ? 'active' : ''} ${complete ? 'complete' : ''}`}>
            <span>{complete ? 'OK' : number}</span>
            <small>{label}</small>
          </div>
        );
      })}
    </nav>
  );
}

function CompletionChecks({ completedSteps }) {
  const checks = [
    ['entries', 'Entradas seleccionadas'],
    ['schedule', 'Horario confirmado'],
    ['photos', 'Fotos elegidas'],
    ['details', 'Datos completos'],
  ];
  return (
    <div className="completion-strip" aria-label="Estado de avance">
      {checks.map(([id, label], index) => (
        <span key={id} className={completedSteps[id] ? 'complete' : ''}>
          <b>{completedSteps[id] ? 'OK' : index + 1}</b>
          {label}
        </span>
      ))}
    </div>
  );
}

function PremiumLoading() {
  return (
    <div className="premium-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div>
        <strong>Preparando tu experiencia YakuExpress...</strong>
        <small>Estamos preparando tu codigo QR para agilizar tu ingreso.</small>
      </div>
    </div>
  );
}

function LoadingLabel() {
  return <span className="loading-label"><span className="spinner mini" aria-hidden="true" /> Preparando QR...</span>;
}

function MobileStickySummary({ order, total, step }) {
  if (step >= 5) return null;
  return (
    <aside className="mobile-sticky-summary" aria-label="Resumen compacto">
      <span>Entradas: <b>{safeItems(order).length}</b></span>
      <span>Fotos: <b>S/{photoPrice(order.photoPack || order.photo_pack)}</b></span>
      <span>Total: <b>S/{total}</b></span>
      {(orderHasFullPass(order) || orderHasAllPhotos(order)) && (
        <small>{orderHasAllPhotos(order) ? 'Recuerdo completo incluido' : 'Experiencia premium incluida'}</small>
      )}
    </aside>
  );
}

function productById(id) { return products.find((product) => product.id === id) || products[0]; }
function slotsForProduct(productId) { return productById(productId).minutes === 90 ? longSlots : shortSlots; }
function firstSlotForProduct(productId) { return slotsForProduct(productId)[0] || ''; }
function slotStart(slot) { return String(slot || '').split(' a ')[0].trim(); }
function equivalentSlotForProduct(slotOrStart, productId) {
  const start = slotStart(slotOrStart);
  if (!start) return '';
  return slotsForProduct(productId).find((slot) => slotStart(slot) === start) || '';
}
function formatSlot(slot) { return String(slot || '').replace(' a ', ' - '); }
function photoPrice(id) { return photoPacks.find((pack) => pack.id === id)?.price || 0; }
function photoLabel(id) { const pack = photoPacks.find((item) => item.id === id); return pack ? `${pack.label} S/${pack.price}` : 'No quiero fotos'; }
function orderHasFullPass(order) { return safeItems(order).some((item) => item.product_id === 'full_pass'); }
function orderHasAllPhotos(order) { return (order?.photoPack || order?.photo_pack) === 'todas'; }
function normalizeOperationalStatus(status) {
  if (status === 'pending') return 'pedido_creado';
  if (status === 'paid') return 'pago_procesado';
  if (status === 'in_fazzure') return 'finalizado';
  if (status === 'cancelled') return 'problema_demora';
  return status || 'pedido_creado';
}
function statusMeta(status) {
  const normalized = normalizeOperationalStatus(status);
  return orderStatusMeta[normalized] || { label: statusLabels[status] || status || 'Pedido creado', tone: 'created' };
}
function statusToneClass(status) { return `state-${statusMeta(status).tone}`; }
function countOrdersByStatus(orders, status) {
  return orders.filter((order) => normalizeOperationalStatus(order.status) === status).length;
}
function buildCashierFilterCounts(orders) {
  return {
    all: orders.length,
    pedido_creado: countOrdersByStatus(orders, 'pedido_creado'),
    cliente_en_caja: countOrdersByStatus(orders, 'cliente_en_caja'),
    pago_procesado: countOrdersByStatus(orders, 'pago_procesado'),
    problema_demora: countOrdersByStatus(orders, 'problema_demora'),
    finalizado: countOrdersByStatus(orders, 'finalizado'),
  };
}
function expressActionsForOrder(order) {
  const status = normalizeOperationalStatus(order?.status);
  if (status === 'pedido_creado') return [['cliente_en_caja', 'Cliente en caja']];
  if (status === 'cliente_en_caja') return [['pago_procesado', 'Pago procesado'], ['problema_demora', 'Problema']];
  if (status === 'pago_procesado') return [['finalizado', 'Finalizar'], ['problema_demora', 'Problema']];
  if (status === 'problema_demora') return [['finalizado', 'Finalizar']];
  return [];
}
function orderPriority(order, now = Date.now()) {
  const status = normalizeOperationalStatus(order?.status);
  const createdAt = timestampValue(order?.created_at) || now;
  const waitStartedAt = timestampValue(order?.updated_at) || createdAt;
  if (status === 'problema_demora') return { label: 'Critico', tone: 'critical', rank: 50, waitStartedAt, waitLabel: 'En problema' };
  if (status === 'finalizado') return { label: 'Finalizado', tone: 'done', rank: 0, waitStartedAt, waitLabel: 'Cerrado' };
  if (status === 'pedido_creado') return { label: 'Esperando cliente', tone: 'waiting', rank: 10, waitStartedAt: createdAt, waitLabel: 'Esperando' };
  const waitMinutes = Math.max(0, Math.floor((now - waitStartedAt) / 60000));
  if (waitMinutes > 10) return { label: 'Urgente', tone: 'urgent', rank: 40, waitStartedAt, waitLabel: 'Espera' };
  if (waitMinutes >= 5) return { label: 'Atencion', tone: 'attention', rank: 30, waitStartedAt, waitLabel: 'Espera' };
  return { label: 'Normal', tone: 'normal', rank: 20, waitStartedAt, waitLabel: 'Espera' };
}
function sortOrdersByPriority(orders, now = Date.now()) {
  return [...orders].sort((a, b) => {
    const priorityA = orderPriority(a, now);
    const priorityB = orderPriority(b, now);
    if (priorityA.rank !== priorityB.rank) return priorityB.rank - priorityA.rank;
    return priorityA.waitStartedAt - priorityB.waitStartedAt;
  });
}
function isWaitingCustomerOrder(order) {
  const status = normalizeOperationalStatus(order?.status);
  return status === 'cliente_en_caja' || status === 'pago_procesado' || status === 'problema_demora';
}
function waitingCustomers(orders, now = Date.now()) {
  return sortOrdersByPriority(orders.filter(isWaitingCustomerOrder), now);
}
function buildOperationalStatus(activeOrders, now = Date.now()) {
  const waitingCount = activeOrders.length;
  const priorities = activeOrders.map((order) => orderPriority(order, now));
  const urgentCount = priorities.filter((priority) => priority.tone === 'urgent').length;
  const criticalCount = activeOrders.filter((order, index) => (
    normalizeOperationalStatus(order.status) === 'problema_demora' || priorities[index]?.tone === 'critical'
  )).length;
  const urgentCriticalCount = urgentCount + criticalCount;
  const attentionCount = activeOrders.filter((order) => {
    const status = normalizeOperationalStatus(order.status);
    return status === 'cliente_en_caja' || status === 'pago_procesado';
  }).length;
  const totalWaitMinutes = priorities.reduce((sum, priority) => {
    const waitStartedAt = Number(priority.waitStartedAt) || now;
    return sum + Math.max(0, Math.floor((now - waitStartedAt) / 60000));
  }, 0);
  const averageWaitMinutes = waitingCount ? Math.round(totalWaitMinutes / waitingCount) : 0;
  let tone = 'fluid';
  let icon = '🟢';
  let label = 'Operacion fluida';
  if (waitingCount >= 5 || urgentCriticalCount >= 2 || criticalCount >= 1) {
    tone = 'saturated';
    icon = '🔴';
    label = 'Operacion saturada';
  } else if (waitingCount >= 3 || urgentCount >= 1) {
    tone = 'slow';
    icon = '🟡';
    label = 'Operacion lenta';
  }
  const alerts = [
    `Hay ${waitingCount} clientes esperando`,
    `Hay ${urgentCount} pedidos urgentes`,
    `Hay ${criticalCount} pedidos criticos`,
    `Tiempo promedio de espera: ${averageWaitMinutes} min`,
  ];
  if (tone === 'saturated') alerts.push('Operacion saturada: priorizar pedidos rojos');
  return { tone, icon, label, waitingCount, attentionCount, urgentCount, criticalCount, urgentCriticalCount, averageWaitMinutes, alerts };
}
function buildSmartOrderAlerts(activeOrders, now = Date.now()) {
  const alerts = [];
  if (activeOrders.length >= 5) {
    alerts.push({
      key: 'active-customers-saturated',
      rank: 20,
      tone: 'attention',
      message: `Hay ${activeOrders.length} clientes esperando: operacion saturada`,
    });
  }
  activeOrders.forEach((order) => {
    const status = normalizeOperationalStatus(order.status);
    const priority = orderPriority(order, now);
    const code = order.code || order.id || 'sin codigo';
    const waitMinutes = Math.max(0, Math.floor((now - (Number(priority.waitStartedAt) || now)) / 60000));
    if (status === 'problema_demora') {
      alerts.push({
        key: `${code}-problem`,
        rank: 50,
        tone: 'critical',
        message: `Pedido #${code}: marcado con problema o demora`,
      });
    }
    if (status === 'cliente_en_caja' && priority.tone === 'urgent') {
      alerts.push({
        key: `${code}-waiting-too-long`,
        rank: 40,
        tone: 'urgent',
        message: `Pedido #${code}: cliente esperando hace ${waitMinutes} min`,
      });
    }
    if (priority.tone === 'urgent' || priority.tone === 'critical') {
      alerts.push({
        key: `${code}-needs-attention`,
        rank: priority.tone === 'critical' ? 50 : 40,
        tone: priority.tone === 'critical' ? 'critical' : 'urgent',
        message: `Pedido #${code} requiere atencion inmediata`,
      });
    }
    if (status === 'pago_procesado' && waitMinutes > 5) {
      alerts.push({
        key: `${code}-paid-not-finalized`,
        rank: 30,
        tone: 'attention',
        message: `Pedido #${code}: pago procesado pendiente de finalizar`,
      });
    }
  });
  return alerts
    .sort((a, b) => b.rank - a.rank)
    .filter((alert, index, sortedAlerts) => sortedAlerts.findIndex((item) => item.key === alert.key) === index);
}
function buildOperationalRecommendations(activeOrders, operationalStatus) {
  const recommendations = [];
  const paidCount = activeOrders.filter((order) => normalizeOperationalStatus(order.status) === 'pago_procesado').length;
  const problemCount = activeOrders.filter((order) => normalizeOperationalStatus(order.status) === 'problema_demora').length;
  if (problemCount >= 1) {
    recommendations.push({
      key: 'resolve-problems',
      rank: 70,
      tone: 'urgent',
      message: 'Sugerencia: resolver primero pedidos marcados con problema.',
    });
  }
  if (operationalStatus.tone === 'saturated') {
    recommendations.push({
      key: 'saturated-flow',
      rank: 60,
      tone: 'urgent',
      message: 'Operacion saturada. Priorizar pedidos rojos y reducir nuevos tiempos de espera.',
    });
  }
  if (paidCount >= 3) {
    recommendations.push({
      key: 'review-paid',
      rank: 50,
      tone: 'preventive',
      message: 'Sugerencia: revisar pedidos cobrados pendientes de finalizar.',
    });
  }
  if (operationalStatus.waitingCount >= 5) {
    recommendations.push({
      key: 'reinforce-cashier',
      rank: 40,
      tone: 'preventive',
      message: 'Sugerencia: reforzar caja o asignar apoyo temporal.',
    });
  }
  if (operationalStatus.waitingCount === 0) {
    recommendations.push({
      key: 'free-operation',
      rank: 30,
      tone: 'stable',
      message: 'No hay clientes activos en caja. Operacion libre.',
    });
  } else if (operationalStatus.tone === 'slow') {
    recommendations.push({
      key: 'slow-flow',
      rank: 30,
      tone: 'preventive',
      message: 'Operacion lenta. Priorizar clientes con mayor tiempo de espera.',
    });
  } else if (operationalStatus.tone === 'fluid') {
    recommendations.push({
      key: 'stable-flow',
      rank: 20,
      tone: 'stable',
      message: 'Operacion estable. Mantener flujo actual.',
    });
  }
  return recommendations
    .sort((a, b) => b.rank - a.rank)
    .filter((recommendation, index, sortedRecommendations) => (
      sortedRecommendations.findIndex((item) => item.message === recommendation.message) === index
    ));
}
function timestampValue(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
function orderIdentifier(order) {
  if (!order || typeof order !== 'object') return '';
  return String(order.code || order.id || '').trim();
}
async function ensureCashierAudio(audioContextRef) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error('Web Audio API no disponible');
  if (!audioContextRef.current) audioContextRef.current = new AudioContext();
  if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
  return audioContextRef.current;
}
function playTone(audio, start, frequency, duration, type = 'sine', volume = 0.16) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}
function playCashierSound(eventType, audioContextRef) {
  const audio = audioContextRef.current;
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  const patterns = {
    enabled: [[0, 660, 0.1, 'sine', 0.1], [0.12, 880, 0.12, 'sine', 0.1]],
    new_order: [[0, 784, 0.16, 'triangle', 0.18], [0.18, 988, 0.18, 'triangle', 0.18], [0.39, 1175, 0.2, 'triangle', 0.16]],
    customer_at_cashier: [[0, 587, 0.13, 'sine', 0.14], [0.16, 740, 0.15, 'sine', 0.14]],
    payment_processed: [[0, 523, 0.12, 'sine', 0.12], [0.14, 659, 0.14, 'sine', 0.12], [0.3, 784, 0.16, 'sine', 0.1]],
    problem: [[0, 220, 0.18, 'sawtooth', 0.16], [0.22, 196, 0.18, 'sawtooth', 0.16], [0.44, 220, 0.22, 'sawtooth', 0.18]],
    finalized: [[0, 880, 0.09, 'sine', 0.09], [0.11, 1047, 0.11, 'sine', 0.08]],
  };
  (patterns[eventType] || patterns.new_order).forEach(([offset, frequency, duration, type, volume]) => {
    playTone(audio, now + offset, frequency, duration, type, volume);
  });
}
function calcTotal(order) { return safeItems(order).reduce((sum, item) => sum + productById(item.product_id).price, 0) + photoPrice(order?.photoPack || order?.photo_pack); }
function blankItem() { return { uid: crypto.randomUUID(), product_id: 'full_pass', slot: '' }; }
function newDraft() { return { items: [blankItem()], sameSlot: true, photoPack: '3_5_fotos', receiptType: 'boleta', customerName: '', documentNumber: '', email: '', phone: '', comments: '', paymentMethod: 'Yape' }; }
function saveDraft(order) { localStorage.setItem('yakuexpress_draft', JSON.stringify(order)); }
function readDraft() { try { return JSON.parse(localStorage.getItem('yakuexpress_draft')); } catch (error) { console.error('Invalid YakuExpress draft:', error); return null; } }
function readSession() { try { return JSON.parse(localStorage.getItem('yakuexpress_staff')); } catch { return null; } }
function validCustomer(order) {
  const errors = customerValidation(order);
  return !errors.customerName && !errors.documentNumber && !errors.phone && !errors.email && order.paymentMethod;
}
function customerValidation(order) {
  const receiptType = order?.receiptType || 'boleta';
  const name = String(order?.customerName || '').trim();
  const documentNumber = String(order?.documentNumber || '').trim();
  const email = String(order?.email || '').trim();
  const phone = String(order?.phone || '').trim();
  const errors = {};
  if (!name) errors.customerName = receiptType === 'boleta' ? 'El nombre es obligatorio.' : 'La razon social es obligatoria.';
  if (!documentNumber) errors.documentNumber = receiptType === 'boleta' ? 'El DNI es obligatorio.' : 'El RUC es obligatorio.';
  if (receiptType === 'boleta' && documentNumber && documentNumber.length !== 8) errors.documentNumber = 'El DNI debe tener 8 digitos.';
  if (receiptType === 'factura' && documentNumber && documentNumber.length !== 11) errors.documentNumber = 'El RUC debe tener 11 digitos.';
  if (!phone) errors.phone = 'El telefono es obligatorio.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Revisa el formato del correo.';
  return errors;
}
function formatDate(value) { return value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-'; }
function formatCountdown(ms) {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
function formatActiveDuration(value, now = Date.now()) {
  if (!value) return '0 min';
  const created = new Date(value).getTime();
  if (Number.isNaN(created)) return '0 min';
  const totalMinutes = Math.max(0, Math.floor((now - created) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}
function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
function formatClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
function formatTvOrderCode(order) {
  const code = String(order?.code || order?.id || '').trim();
  if (!code) return '-';
  return code.replace(/^YAKU-/i, 'YAKU ');
}
function formatOperationalTone(tone) {
  if (tone === 'saturated') return 'SATURADO';
  if (tone === 'slow') return 'LENTO';
  return 'FLUIDO';
}
function formatSupabaseError(error) {
  if (!error) return 'No se pudo crear el pedido.';
  const parts = [
    error.message,
    error.details && `Detalles: ${error.details}`,
    error.hint && `Sugerencia: ${error.hint}`,
    error.code && `Codigo: ${error.code}`,
  ].filter(Boolean);
  return parts.join(' | ') || 'No se pudo crear el pedido.';
}
function normalizeOrderSearch(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return `YAKU-${raw.padStart(4, '0')}`;
  return raw;
}
function normalizeRecoveredOrder(order) {
  if (!order || typeof order !== 'object') return newDraft();
  return {
    ...order,
    receiptType: order.receiptType || order.receipt_type || 'boleta',
    customerName: order.customerName || order.customer_name || '',
    documentNumber: order.documentNumber || order.document_number || '',
    photoPack: order.photoPack || order.photo_pack || 'none',
    paymentMethod: order.paymentMethod || order.payment_method || 'Yape',
    editToken: order.editToken || order.edit_token || '',
    email: order.email || '',
    phone: order.phone || '',
    comments: order.comments || '',
    items: safeItems(order).map((item) => ({ ...item, uid: item.uid || crypto.randomUUID() })),
  };
}
function whatsappPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9) return `51${digits}`;
  return digits;
}
function basePath() { return import.meta.env.BASE_URL.replace(/\/$/, ''); }
function stripBasePath(pathname) {
  const base = basePath();
  if (base && base !== '/' && pathname.startsWith(base)) return pathname.slice(base.length) || '/';
  return pathname;
}
function withBasePath(pathname) {
  const base = basePath();
  if (!base || base === '/') return pathname;
  return `${base}${pathname}`;
}
function currentRoute() { return stripBasePath(window.location.pathname); }
function normalizeDraft(draft) {
  if (!draft || !Array.isArray(draft.items)) return null;
  return { ...draft, items: draft.items.map((item) => ({ ...item, uid: item.uid || crypto.randomUUID() })) };
}

function safeItems(order) {
  return Array.isArray(order?.items) && order.items.length ? order.items : [blankItem()];
}

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
