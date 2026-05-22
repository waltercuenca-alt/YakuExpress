import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';
import StoreBanner from '../components/store/StoreBanner.jsx';
import ProductCard from '../components/store/ProductCard.jsx';
import CartSummary from '../components/store/CartSummary.jsx';
import OrderSuccess from '../components/store/OrderSuccess.jsx';

const SOCKS_ID = '00000000-0000-0000-0000-000000000009';
const bannerUrl = '/store/yaku-store-reference.png';

const fallbackProducts = [
  ['00000000-0000-0000-0000-000000000001', 'Bloqueador SPF 50', 'Proteccion solar', 5, false, 'Recomendado', '#ff9f1c'],
  ['00000000-0000-0000-0000-000000000002', 'Tote Bag YakuPark', 'Merch oficial', 20, false, '', '#00a7e1'],
  ['00000000-0000-0000-0000-000000000003', 'Gorro de natacion', 'Agua y aventura', 20, false, '', '#5bc236'],
  ['00000000-0000-0000-0000-000000000004', 'Short Licra Mujer', 'Ropa acuatica', 20, true, 'Mas vendido', '#5bc236'],
  ['00000000-0000-0000-0000-000000000005', 'Short YakuPark', 'Ropa acuatica', 20, true, 'Mas vendido', '#e1005a'],
  ['00000000-0000-0000-0000-000000000006', 'Polo algodon', 'Merch oficial', 35, false, '', '#003c7c'],
  ['00000000-0000-0000-0000-000000000007', 'Polo alicrado con cierre', 'Ropa acuatica', 35, true, 'Recomendado', '#00a7e1'],
  ['00000000-0000-0000-0000-000000000008', 'Polo alicrado sin cierre', 'Ropa acuatica', 30, true, 'Recomendado', '#5bc236'],
  [SOCKS_ID, 'Medias antideslizantes', 'Producto estrella', 10, true, 'Mas vendido', '#a7e818'],
].map(([id, name, category, price, featured, badge, color]) => ({
  id,
  name,
  category,
  price,
  featured,
  badge,
  active: true,
  image_url: productImage(name, color),
}));

export default function Tienda({ navigate }) {
  const [products, setProducts] = useState(fallbackProducts);
  const [quantities, setQuantities] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successOrder, setSuccessOrder] = useState(null);

  useEffect(() => {
    const loadProducts = async () => {
      const { data, error: loadError } = await supabase
        .from('store_products')
        .select('*')
        .eq('active', true)
        .order('featured', { ascending: false })
        .order('created_at', { ascending: true });
      if (!loadError && Array.isArray(data) && data.length) {
        setProducts(data.map((product) => ({
          ...product,
          badge: product.featured ? featuredBadge(product.name) : '',
          image_url: product.image_url || productImage(product.name, product.featured ? '#00a7e1' : '#ff9f1c'),
        })));
      }
    };
    loadProducts();
  }, []);

  const cartItems = useMemo(() => products
    .map((product) => {
      const quantity = quantities[product.id] || 0;
      const unitPrice = unitPriceForProduct(product, quantity);
      return {
        product,
        quantity,
        unitPrice,
        subtotal: quantity * unitPrice,
      };
    })
    .filter((item) => item.quantity > 0), [products, quantities]);
  const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

  const setQuantity = (productId, quantity) => {
    setQuantities((current) => ({ ...current, [productId]: Math.max(0, Number(quantity) || 0) }));
  };

  const addOne = (productId) => {
    setQuantities((current) => ({ ...current, [productId]: (current[productId] || 0) + 1 }));
  };

  const checkout = async () => {
    setBusy(true);
    setError('');
    try {
      const code = await nextStoreCode();
      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .insert({ code, total, status: 'pending' })
        .select()
        .single();
      if (orderError) throw orderError;
      const rows = cartItems.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.subtotal,
      }));
      const { error: itemsError } = await supabase.from('store_order_items').insert(rows);
      if (itemsError) throw itemsError;
      setSuccessOrder({ ...order, items: cartItems, total, code });
    } catch (checkoutError) {
      console.error('YakuExpress tienda error:', checkoutError);
      setError('No pudimos generar el pedido. Verifica que el SQL de tienda ya fue ejecutado en Supabase.');
    } finally {
      setBusy(false);
    }
  };

  if (successOrder) {
    return <OrderSuccess order={successOrder} onNewOrder={() => { setSuccessOrder(null); setQuantities({}); }} />;
  }

  return (
    <main className="store-shell">
      <StoreBanner imageUrl={bannerUrl} />
      <section className="store-trust">
        <span>Productos oficiales YakuPark</span>
        <strong>Compra digital, muestra tu codigo en caja y retira antes de volver al agua.</strong>
        <button type="button" onClick={() => navigate('/cliente')}>Volver a YakuExpress</button>
      </section>
      <section className="store-layout">
        <div className="store-grid">
          {products.map((product) => {
            const quantity = quantities[product.id] || 0;
            const unitPrice = unitPriceForProduct(product, quantity || 1);
            return (
              <ProductCard
                key={product.id}
                product={product}
                quantity={quantity}
                unitPrice={unitPrice}
                subtotal={quantity * unitPrice}
                onQuantityChange={(nextQuantity) => setQuantity(product.id, nextQuantity)}
                onAdd={() => addOne(product.id)}
              />
            );
          })}
        </div>
        <CartSummary items={cartItems} total={total} onCheckout={checkout} busy={busy} error={error} />
      </section>
    </main>
  );
}

function unitPriceForProduct(product, quantity) {
  if (product.id !== SOCKS_ID) return Number(product.price) || 0;
  if (quantity >= 6) return 5;
  if (quantity >= 5) return 6;
  if (quantity >= 4) return 7;
  if (quantity >= 3) return 8;
  if (quantity >= 2) return 9;
  return 10;
}

async function nextStoreCode() {
  const { data, error } = await supabase
    .from('store_orders')
    .select('code')
    .like('code', 'YK-STORE-%')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const lastCode = data?.[0]?.code || '';
  const lastNumber = Number(String(lastCode).replace(/\D/g, '')) || 0;
  return `YK-STORE-${String(lastNumber + 1).padStart(4, '0')}`;
}

function featuredBadge(name) {
  return /media|short|alicrado/i.test(name) ? 'Mas vendido' : 'Recomendado';
}

function productImage(name, color) {
  const label = String(name).replace(/&/g, 'y');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 520">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#ffffff"/>
          <stop offset="1" stop-color="#dff8ff"/>
        </linearGradient>
      </defs>
      <rect width="640" height="520" rx="44" fill="url(#bg)"/>
      <circle cx="528" cy="82" r="76" fill="${color}" opacity=".22"/>
      <path d="M80 356c78-54 143-58 219-13 72 42 142 38 244-25v106H80z" fill="#00bfb3" opacity=".24"/>
      <rect x="170" y="92" width="300" height="260" rx="42" fill="${color}"/>
      <text x="320" y="400" text-anchor="middle" font-family="Arial" font-size="38" font-weight="900" fill="#045a83">${label}</text>
      <text x="320" y="222" text-anchor="middle" font-family="Arial" font-size="48" font-weight="900" fill="#ffffff">YAKU</text>
      <text x="320" y="278" text-anchor="middle" font-family="Arial" font-size="48" font-weight="900" fill="#ffffff">PARK</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
