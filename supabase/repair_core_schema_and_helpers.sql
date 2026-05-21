create extension if not exists pgcrypto;

do $$
begin
  create type public.order_status as enum ('pedido_creado', 'cliente_en_caja', 'pago_procesado', 'finalizado', 'problema_demora', 'pending', 'paid', 'in_fazzure', 'cancelled', 'expired');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.receipt_type as enum ('boleta', 'factura');
exception when duplicate_object then null;
end $$;

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  code text unique not null,
  edit_token uuid not null,
  receipt_type public.receipt_type not null,
  customer_name text not null,
  document_number text not null,
  email text not null,
  phone text not null,
  comments text,
  payment_method text not null,
  photo_pack text not null default 'none',
  total numeric(10,2) not null default 0,
  status public.order_status not null default 'pedido_creado',
  expires_at timestamptz not null default now() + interval '1 hour',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  price numeric(10,2) not null,
  duration_minutes integer not null,
  slot text not null,
  created_at timestamptz not null default now()
);

create sequence if not exists public.yaku_order_code_seq start 1;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "No direct read orders" on public.orders;
drop policy if exists "No direct read items" on public.order_items;

create policy "No direct read orders" on public.orders for all using (false) with check (false);
create policy "No direct read items" on public.order_items for all using (false) with check (false);

create or replace function public.product_price(p_product text)
returns numeric
language sql
immutable
as $$
  select case p_product
    when 'standard' then 50
    when 'full_pass' then 80
    when 'premium_kids' then 60
    when 'kids_normal' then 30
    else 0
  end;
$$;

create or replace function public.product_name(p_product text)
returns text
language sql
immutable
as $$
  select case p_product
    when 'standard' then 'Pulsera Standard'
    when 'full_pass' then 'Full Pass'
    when 'premium_kids' then 'Premium Kids'
    when 'kids_normal' then 'Kids Normal'
    else 'Entrada'
  end;
$$;

create or replace function public.product_minutes(p_product text)
returns integer
language sql
immutable
as $$
  select case p_product
    when 'standard' then 45
    when 'kids_normal' then 45
    when 'full_pass' then 90
    when 'premium_kids' then 90
    else 45
  end;
$$;

create or replace function public.photo_price(p_pack text)
returns numeric
language sql
immutable
as $$
  select case p_pack
    when 'none' then 0
    when 'two' then 30
    when 'three_to_five' then 50
    when 'all' then 80
    -- Compatibilidad con los ids actuales del frontend.
    when '2_fotos' then 30
    when '3_5_fotos' then 50
    when 'todas' then 80
    else 0
  end;
$$;

create or replace function public.get_order_payload(p_code text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'code', o.code,
    'receipt_type', o.receipt_type,
    'customer_name', o.customer_name,
    'document_number', o.document_number,
    'email', o.email,
    'phone', o.phone,
    'comments', o.comments,
    'payment_method', o.payment_method,
    'photo_pack', o.photo_pack,
    'total', o.total,
    'status', case when o.status::text in ('pending', 'pedido_creado') and o.expires_at < now() then 'expired' else o.status::text end,
    'expires_at', o.expires_at,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'product_id', i.product_id,
      'product_name', i.product_name,
      'price', i.price,
      'duration_minutes', i.duration_minutes,
      'slot', i.slot
    ) order by i.id) filter (where i.id is not null), '[]'::jsonb)
  )
  from public.orders o
  left join public.order_items i on i.order_id = o.id
  where o.code = p_code
  group by o.id;
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.product_price(text) to anon, authenticated;
grant execute on function public.product_name(text) to anon, authenticated;
grant execute on function public.product_minutes(text) to anon, authenticated;
grant execute on function public.photo_price(text) to anon, authenticated;
grant execute on function public.get_order_payload(text) to anon, authenticated;

notify pgrst, 'reload schema';
