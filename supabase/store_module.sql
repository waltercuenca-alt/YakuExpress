create extension if not exists pgcrypto;

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  price numeric not null,
  image_url text,
  featured boolean default false,
  active boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  total numeric not null,
  status text default 'pending' check (status in ('pending', 'paid', 'delivered', 'cancelled')),
  created_at timestamp with time zone default now()
);

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.store_orders(id) on delete cascade,
  product_id uuid references public.store_products(id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric not null,
  subtotal numeric not null,
  created_at timestamp with time zone default now()
);

create index if not exists store_products_active_idx on public.store_products(active, featured, created_at);
create index if not exists store_orders_status_created_idx on public.store_orders(status, created_at desc);
create index if not exists store_order_items_order_id_idx on public.store_order_items(order_id);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'store_products'
      and policyname = 'store_products_public_select'
  ) then
    create policy "store_products_public_select"
      on public.store_products
      for select
      to anon, authenticated
      using (active = true);
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('store-products', 'store-products', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'store_products_public_read'
  ) then
    create policy "store_products_public_read"
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'store-products');
  end if;
end $$;

insert into public.store_products (id, name, category, price, image_url, featured, active)
values
  ('00000000-0000-0000-0000-000000000001', 'Bloqueador SPF 50', 'Proteccion solar', 5, null, false, true),
  ('00000000-0000-0000-0000-000000000002', 'Tote Bag YakuPark', 'Merch oficial', 20, null, false, true),
  ('00000000-0000-0000-0000-000000000003', 'Gorro de natacion', 'Agua y aventura', 20, null, false, true),
  ('00000000-0000-0000-0000-000000000004', 'Short Licra Mujer', 'Ropa acuatica', 20, null, true, true),
  ('00000000-0000-0000-0000-000000000005', 'Short YakuPark', 'Ropa acuatica', 20, null, true, true),
  ('00000000-0000-0000-0000-000000000006', 'Polo algodon', 'Merch oficial', 35, null, false, true),
  ('00000000-0000-0000-0000-000000000007', 'Polo alicrado con cierre', 'Ropa acuatica', 35, null, true, true),
  ('00000000-0000-0000-0000-000000000008', 'Polo alicrado sin cierre', 'Ropa acuatica', 30, null, true, true),
  ('00000000-0000-0000-0000-000000000009', 'Medias antideslizantes', 'Producto estrella', 10, null, true, true)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  featured = excluded.featured,
  active = excluded.active;

grant select on public.store_products to anon, authenticated;
grant select, insert, update on public.store_orders to anon, authenticated;
grant select, insert, update on public.store_order_items to anon, authenticated;
