import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase, syncOrderToSheets } from './supabase.js';
import './styles.css';

const products = [
  { id: 'standard', name: 'Pulsera Standard', price: 50, minutes: 45, badge: '', details: ['45 minutos'] },
  { id: 'full_pass', name: 'Full Pass', price: 80, minutes: 90, badge: 'MAS ELEGIDO', details: ['90 minutos', '1 foto gratis', 'media de regalo'], hero: true },
  { id: 'premium_kids', name: 'Premium Kids', price: 60, minutes: 90, badge: '', details: ['90 minutos'] },
  { id: 'kids_normal', name: 'Kids Normal', price: 30, minutes: 45, badge: '', details: ['45 minutos'] },
];

const shortSlots = ['9:30 a 10:15', '10:30 a 11:15', '11:30 a 12:15', '12:30 a 13:15', '13:30 a 14:15', '14:30 a 15:15', '15:30 a 16:15', '16:30 a 17:15', '17:15 a 18:00'];
const longSlots = ['9:30 a 11:00', '10:30 a 12:00', '11:30 a 13:00', '12:30 a 14:00', '13:30 a 15:00', '14:30 a 16:00', '15:30 a 17:00', '16:30 a 18:00'];
const photoPacks = [
  { id: 'none', label: 'No quiero fotos', price: 0 },
  { id: '2_fotos', label: '2 fotos', price: 30 },
  { id: '3_5_fotos', label: '3 a 5 fotos', price: 50, featured: true },
  { id: 'todas', label: 'Todas las fotos', price: 80, featured: true },
];
const payMethods = ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Transferencia', 'Otro'];
const statusLabels = {
  pending: 'Pendiente',
  paid: 'Pagado',
  in_fazzure: 'En Fazzure',
  cancelled: 'Cancelado',
  expired: 'Expirado',
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

  const items = safeItems(order);
  const total = useMemo(() => calcTotal(order), [order]);
  const hasStandard = items.some((item) => item.product_id === 'standard');

  useEffect(() => saveDraft(order), [order]);

  const setItem = (index, patch) => {
    const nextItems = safeItems(order).map((item, i) => (i === index ? { ...item, ...patch } : item));
    setOrder({ ...order, items: nextItems });
  };

  const applySameSlot = (slot) => {
    setOrder({ ...order, sameSlot: true, items: safeItems(order).map((item) => ({ ...item, slot })) });
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

  if (step === 5) return <Confirmation order={order} setOrder={setOrder} setStep={setStep} navigate={navigate} />;

  return (
    <Shell>
      <section className="hero">
        <div>
          <p>YakuExpress</p>
          <h1>Elegí, confirmá y llegá a caja con tu pedido listo.</h1>
        </div>
        <Icon label="A" large />
      </section>

      <Progress step={step} />

      {step === 1 && (
        <section className="panel">
          <SectionTitle icon={<Icon label="1" />} title="Elegí tu experiencia" />
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
          {hasStandard && <Upsell onUpgrade={() => setOrder({ ...order, items: safeItems(order).map((item) => (item.product_id === 'standard' ? { ...item, product_id: 'full_pass', slot: '' } : item)) })} />}
          <Next onClick={() => setStep(2)} disabled={items.some((item) => !item.product_id)} />
        </section>
      )}

      {step === 2 && (
        <section className="panel">
          <SectionTitle icon={<Icon label="2" />} title="Elegí horarios" />
          <label className="check-row">
            <input type="checkbox" checked={order.sameSlot} onChange={(e) => setOrder({ ...order, sameSlot: e.target.checked })} />
            <span>Mismo horario para todo el grupo</span>
          </label>
          {order.sameSlot ? (
            <SlotChooser item={items[0]} value={items[0]?.slot || ''} onChange={applySameSlot} />
          ) : (
            items.map((item, index) => (
              <div className="mini-panel" key={item.uid || `${item.product_id}-${index}`}>
                <strong>{productById(item.product_id).name}</strong>
                <SlotChooser item={item} value={item.slot} onChange={(slot) => setItem(index, { slot })} />
              </div>
            ))
          )}
          <StepActions back={() => setStep(1)} next={() => setStep(3)} disabled={items.some((item) => !item.slot)} />
        </section>
      )}

      {step === 3 && (
        <section className="panel">
          <SectionTitle icon={<Icon label="3" />} title="Los recuerdos se viven una sola vez" />
          <p className="soft">Nuestros fotografos capturan tus mejores momentos dentro del parque para que te lleves un recuerdo inolvidable.</p>
          <div className="option-grid">
            {photoPacks.map((pack) => (
              <button key={pack.id} className={`option-card ${order.photoPack === pack.id ? 'selected' : ''} ${pack.featured ? 'featured' : ''}`} onClick={() => setOrder({ ...order, photoPack: pack.id })}>
                {pack.featured && <span>Recomendado</span>}
                <strong>{pack.label}</strong>
                <b>{pack.price ? `S/${pack.price}` : 'S/0'}</b>
              </button>
            ))}
          </div>
          <StepActions back={() => setStep(2)} next={() => setStep(4)} />
        </section>
      )}

      {step === 4 && (
        <section className="panel">
          <SectionTitle icon={<Icon label="4" />} title="Datos para caja" />
          <div className="toggle">
            {['boleta', 'factura'].map((type) => (
              <button key={type} className={order.receiptType === type ? 'active' : ''} onClick={() => setOrder({ ...order, receiptType: type, customerName: '', documentNumber: '' })}>
                {type === 'boleta' ? 'Boleta' : 'Factura'}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <Field label={order.receiptType === 'boleta' ? 'Nombre' : 'Razon social'} value={order.customerName} onChange={(v) => setOrder({ ...order, customerName: v })} />
            <Field label={order.receiptType === 'boleta' ? 'DNI' : 'RUC'} value={order.documentNumber} onChange={(v) => setOrder({ ...order, documentNumber: v.replace(/\D/g, '') })} inputMode="numeric" />
            <Field label="Correo" value={order.email} onChange={(v) => setOrder({ ...order, email: v })} type="email" />
            <Field label="Telefono" value={order.phone} onChange={(v) => setOrder({ ...order, phone: v.replace(/\D/g, '') })} inputMode="tel" />
          </div>
          <label className="field">
            <span>Comentarios / observaciones</span>
            <textarea value={order.comments} onChange={(e) => setOrder({ ...order, comments: e.target.value })} rows="3" />
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
          <StepActions back={() => setStep(3)} next={submit} disabled={!validCustomer(order) || busy} label={busy ? 'Creando...' : 'Generar codigo y QR'} />
        </section>
      )}
    </Shell>
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
            {product.badge && <span className="badge">{product.badge}</span>}
            {product.hero && <span className="badge second">MEJOR EXPERIENCIA</span>}
            <strong>{product.name}</strong>
            <b>S/{product.price}</b>
            <small>{product.minutes} min</small>
            <ul>{product.details.map((detail) => <li key={detail}>OK {detail}</li>)}</ul>
          </button>
        ))}
      </div>
    </div>
  );
}

function Upsell({ onUpgrade }) {
  return (
    <div className="upsell">
      <Icon label="+" />
      <div>
        <strong>Aprovecha mas tu experiencia</strong>
        <p>Por solo S/30 mas llevate 90 minutos, 1 foto gratis incluida y media de regalo.</p>
        <small>La experiencia mas elegida por nuestros visitantes</small>
      </div>
      <button onClick={onUpgrade}>Cambiar a Full Pass</button>
    </div>
  );
}

function SlotChooser({ item, value, onChange }) {
  const slots = productById(item.product_id).minutes === 90 ? longSlots : shortSlots;
  return (
    <div className="slots">
      {slots.map((slot) => (
        <button key={slot} className={value === slot ? 'slot active' : 'slot'} onClick={() => onChange(slot)}>
          {slot}
        </button>
      ))}
    </div>
  );
}

function Confirmation({ order, setOrder, setStep, navigate }) {
  const qrValue = `${location.origin}${withBasePath(`/caja?codigo=${order.code}`)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrValue)}`;
  const expired = order.expires_at && new Date(order.expires_at) < new Date();
  const createNewOrder = () => {
    localStorage.removeItem('yakuexpress_draft');
    setOrder(newDraft());
    setStep(1);
  };
  return (
    <Shell>
      <section className="done">
        {expired ? (
          <>
            <h1>Tu pedido expiro</h1>
            <p>Por favor realiza uno nuevo.</p>
            <button onClick={createNewOrder}>Crear nuevo pedido</button>
          </>
        ) : (
          <>
            <button className="ghost wide" onClick={createNewOrder}>Crear nuevo pedido</button>
            <Icon label="OK" large />
            <h1>Mostra este codigo en caja</h1>
            <div className="code">{order.code}</div>
            <div className="qr"><img src={qrUrl} alt={`QR del pedido ${order.code}`} width="260" height="260" /></div>
            <p>Vence: {formatDate(order.expires_at)}</p>
            <Summary order={order} total={order.total || calcTotal(order)} />
            <div className="actions">
              <button className="ghost" onClick={() => setStep(1)}>Editar pedido</button>
              <button onClick={() => navigate('/caja')}>Ir a caja</button>
            </div>
            <button className="wide" onClick={createNewOrder}>Crear nuevo pedido</button>
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
  const [query, setQuery] = useState(new URLSearchParams(location.search).get('codigo') || '');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setSearchMessage('Buscando pedido...');
    try {
      const normalizedQuery = normalizeOrderSearch(query);
      const { data, error } = await supabase.rpc('staff_list_orders', {
        p_session_token: session.token,
        p_query: normalizedQuery || null,
      });
      if (error) throw error;
      const nextOrders = Array.isArray(data) ? data.filter(Boolean) : [];
      setOrders(nextOrders);
      setSearchMessage(nextOrders.length ? '' : 'Pedido no encontrado');
    } catch (error) {
      console.error('YakuExpress caja search error:', {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        raw: error,
        query,
        session,
      });
      setOrders([]);
      setSearchMessage(`Error al buscar pedido: ${formatSupabaseError(error)}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (code, status) => {
    const { error } = await supabase.rpc('staff_update_order_status', {
      p_session_token: session.token,
      p_code: code,
      p_status: status,
    });
    if (error) throw error;
    await syncOrderToSheets(code);
    await load();
  };

  return (
    <Shell compact>
      <section className="panel staff">
        <StaffHeader title="Caja" session={session} setSession={setSession} />
        <div className="searchbar">
          <span className="search-icon">Buscar</span>
          <input value={query} onChange={(e) => setQuery(e.target.value.toUpperCase())} placeholder="Buscar por codigo YAKU-0001" />
          <button onClick={load} disabled={loading}>{loading ? 'Buscando...' : 'Actualizar'}</button>
        </div>
        {searchMessage && <p className={searchMessage.startsWith('Error') ? 'error' : 'soft'}>{searchMessage}</p>}
        <div className="table-list">
          {orders.map((order) => (
            <article key={order.code} className="order-row">
              <div>
                <strong>{order.code}</strong>
                <span>{order.customer_name} · {order.document_number}</span>
                <small>{order.phone} · vence {formatDate(order.expires_at)}</small>
              </div>
              <b>S/{order.total}</b>
              <button className="ghost" onClick={() => setSelected(order)}>Ver / editar</button>
            </article>
          ))}
        </div>
      </section>
        {selected && <OrderModal order={selected} session={session} close={() => setSelected(null)} updateStatus={updateStatus} refresh={load} />}
    </Shell>
  );
}

function OrderModal({ order, session, close, updateStatus, refresh }) {
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

  const runAction = async (action) => {
    setSaving(true);
    setActionMessage('');
    setActionError('');
    try {
      await action();
      await refresh();
      setActionMessage('Pedido actualizado correctamente');
    } catch (error) {
      console.error('YakuExpress caja action error:', {
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
    const { error } = await supabase.rpc('staff_update_order_details', {
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
  };
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <button className="icon-button close" onClick={close}>x</button>
        <h2>{order.code}</h2>
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
        <button className="wide" onClick={() => runAction(save)} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
        <div className="status-grid">
          {[
            ['pending', 'Pendiente'],
            ['paid', 'Pagado'],
            ['in_fazzure', 'En Fazzure'],
            ['cancelled', 'Cancelado'],
          ].map(([status, label]) => (
            <button key={status} className={`status ${status}`} disabled={saving} onClick={() => runAction(() => updateStatus(order.code, status))}>
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
  const load = async () => {
    const { data } = await supabase.rpc('staff_daily_report', { p_session_token: session.token });
    setStats(data);
  };
  useEffect(() => { load(); }, []);
  const cards = stats ? [
    ['Pedidos totales', stats.total_orders],
    ['Entradas vendidas', stats.entries_sold],
    ['Full Pass vendidos', stats.full_pass],
    ['Standard vendidos', stats.standard],
    ['Premium Kids vendidos', stats.premium_kids],
    ['Kids Normal vendidos', stats.kids_normal],
    ['Packs de fotos', stats.photo_packs],
    ['Conversion premium', `${stats.premium_conversion}%`],
    ['Ticket promedio', `S/${stats.average_ticket}`],
    ['Total estimado', `S/${stats.estimated_total}`],
    ['Metodo top', stats.top_payment_method || '-'],
    ['Horario top', stats.top_slot || '-'],
    ['Eligio fotos', `${stats.photo_percentage}%`],
  ] : [];
  return (
    <Shell compact>
      <section className="panel staff">
        <StaffHeader title="Marketing en vivo" session={session} setSession={setSession} />
        <button className="ghost" onClick={load}>Actualizar</button>
        <div className="metric-grid">
          {cards.map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}
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

function Field({ label, value, onChange, type = 'text', inputMode }) {
  return <label className="field"><span>{label}</span><input type={type} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

function Summary({ order, total }) {
  const grouped = safeItems(order).reduce((acc, item) => ({ ...acc, [item.product_id]: (acc[item.product_id] || 0) + 1 }), {});
  return (
    <div className="summary">
      <strong>Resumen</strong>
      {Object.entries(grouped).map(([id, qty]) => <span key={id}>{qty} {productById(id).name} - S/{qty * productById(id).price}</span>)}
      <span>Fotos - S/{photoPrice(order.photoPack || order.photo_pack)}</span>
      <b>TOTAL: S/{total}</b>
    </div>
  );
}

function StepActions({ back, next, disabled, label = 'Continuar' }) {
  return <div className="actions"><button className="ghost" onClick={back}>Atras</button><button onClick={next} disabled={disabled}>{label}</button></div>;
}
function Next({ onClick, disabled }) { return <button className="wide" onClick={onClick} disabled={disabled}>Continuar</button>; }
function Progress({ step }) { return <div className="progress">{[1, 2, 3, 4].map((n) => <span key={n} className={step >= n ? 'active' : ''} />)}</div>; }

function productById(id) { return products.find((product) => product.id === id) || products[0]; }
function photoPrice(id) { return photoPacks.find((pack) => pack.id === id)?.price || 0; }
function photoLabel(id) { const pack = photoPacks.find((item) => item.id === id); return pack ? `${pack.label} S/${pack.price}` : 'No quiero fotos'; }
function calcTotal(order) { return safeItems(order).reduce((sum, item) => sum + productById(item.product_id).price, 0) + photoPrice(order?.photoPack || order?.photo_pack); }
function blankItem() { return { uid: crypto.randomUUID(), product_id: 'full_pass', slot: '' }; }
function newDraft() { return { items: [blankItem()], sameSlot: true, photoPack: '3_5_fotos', receiptType: 'boleta', customerName: '', documentNumber: '', email: '', phone: '', comments: '', paymentMethod: 'Yape' }; }
function saveDraft(order) { localStorage.setItem('yakuexpress_draft', JSON.stringify(order)); }
function readDraft() { try { return JSON.parse(localStorage.getItem('yakuexpress_draft')); } catch (error) { console.error('Invalid YakuExpress draft:', error); return null; } }
function readSession() { try { return JSON.parse(localStorage.getItem('yakuexpress_staff')); } catch { return null; } }
function validCustomer(order) { return order.customerName && order.documentNumber && order.email && order.phone && order.paymentMethod; }
function formatDate(value) { return value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-'; }
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
