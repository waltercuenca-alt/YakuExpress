create extension if not exists pgcrypto;

do $$
begin
  create type order_status as enum ('pending', 'paid', 'in_fazzure', 'cancelled', 'expired');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type receipt_type as enum ('boleta', 'factura');
exception when duplicate_object then null;
end $$;

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  code text unique not null,
  edit_token uuid not null,
  receipt_type receipt_type not null,
  customer_name text not null,
  document_number text not null,
  email text not null,
  phone text not null,
  comments text,
  payment_method text not null,
  photo_pack text not null default 'none',
  total numeric(10,2) not null default 0,
  status order_status not null default 'pending',
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

create table if not exists public.staff_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text not null check (role in ('caja', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.staff_sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.staff_users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '12 hours',
  created_at timestamptz not null default now()
);

create sequence if not exists public.yaku_order_code_seq start 1;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.staff_users enable row level security;
alter table public.staff_sessions enable row level security;

drop policy if exists "No direct read orders" on public.orders;
drop policy if exists "No direct read items" on public.order_items;
drop policy if exists "No direct staff users" on public.staff_users;
drop policy if exists "No direct staff sessions" on public.staff_sessions;

create policy "No direct read orders" on public.orders for all using (false) with check (false);
create policy "No direct read items" on public.order_items for all using (false) with check (false);
create policy "No direct staff users" on public.staff_users for all using (false) with check (false);
create policy "No direct staff sessions" on public.staff_sessions for all using (false) with check (false);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

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
  select case when p_product in ('full_pass', 'premium_kids') then 90 else 45 end;
$$;

create or replace function public.photo_price(p_pack text)
returns numeric
language sql
immutable
as $$
  select case p_pack
    when '2_fotos' then 30
    when '3_5_fotos' then 50
    when 'todas' then 80
    else 0
  end;
$$;

create or replace function public.is_staff_session(p_token uuid, p_role text default null)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_sessions s
    join public.staff_users u on u.id = s.user_id
    where s.token = p_token
      and s.expires_at > now()
      and (p_role is null or u.role = p_role or u.role = 'admin')
  );
$$;

create or replace function public.staff_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.staff_users%rowtype;
  v_token uuid;
begin
  select * into v_user from public.staff_users where username = lower(trim(p_username));
  if v_user.id is null or v_user.password_hash <> crypt(p_password, v_user.password_hash) then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.staff_sessions(user_id) values (v_user.id) returning token into v_token;
  return jsonb_build_object('ok', true, 'session_token', v_token, 'role', v_user.role);
end;
$$;

drop function if exists public.create_public_order(uuid, text, text, text, text, text, text, text, text, jsonb);
drop function if exists public.create_public_order(text, text, text, uuid, text, jsonb, text, text, text, text);

create or replace function public.create_public_order(
  p_comments text,
  p_customer_name text,
  p_document_number text,
  p_edit_token uuid,
  p_email text,
  p_items jsonb,
  p_payment_method text,
  p_phone text,
  p_photo_pack text,
  p_receipt_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_order_id bigint;
  v_item jsonb;
  v_total numeric := public.photo_price(p_photo_pack);
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe tener entradas';
  end if;

  v_code := 'YAKU-' || lpad(nextval('public.yaku_order_code_seq')::text, 4, '0');

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_total := v_total + public.product_price(v_item->>'product_id');
  end loop;

  insert into public.orders(
    code, edit_token, receipt_type, customer_name, document_number, email, phone,
    comments, payment_method, photo_pack, total
  ) values (
    v_code, p_edit_token, p_receipt_type::receipt_type, trim(p_customer_name),
    trim(p_document_number), trim(p_email), trim(p_phone), nullif(trim(coalesce(p_comments, '')), ''),
    p_payment_method, p_photo_pack, v_total
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items(order_id, product_id, product_name, price, duration_minutes, slot)
    values (
      v_order_id,
      v_item->>'product_id',
      public.product_name(v_item->>'product_id'),
      public.product_price(v_item->>'product_id'),
      public.product_minutes(v_item->>'product_id'),
      v_item->>'slot'
    );
  end loop;

  return public.get_order_payload(v_code);
end;
$$;

create or replace function public.update_public_order(
  p_code text,
  p_edit_token uuid,
  p_receipt_type text,
  p_customer_name text,
  p_document_number text,
  p_email text,
  p_phone text,
  p_comments text,
  p_payment_method text,
  p_photo_pack text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_total numeric := public.photo_price(p_photo_pack);
begin
  select * into v_order
  from public.orders
  where code = p_code and edit_token = p_edit_token
  for update;

  if v_order.id is null then
    raise exception 'Pedido no encontrado';
  end if;
  if v_order.status <> 'pending' then
    raise exception 'Solo se puede editar antes del pago';
  end if;
  if v_order.expires_at < now() then
    update public.orders set status = 'expired' where id = v_order.id;
    raise exception 'El pedido expiro';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe tener entradas';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_total := v_total + public.product_price(v_item->>'product_id');
  end loop;

  update public.orders set
    receipt_type = p_receipt_type::receipt_type,
    customer_name = trim(p_customer_name),
    document_number = trim(p_document_number),
    email = trim(p_email),
    phone = trim(p_phone),
    comments = nullif(trim(coalesce(p_comments, '')), ''),
    payment_method = p_payment_method,
    photo_pack = p_photo_pack,
    total = v_total
  where id = v_order.id;

  delete from public.order_items where order_id = v_order.id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items(order_id, product_id, product_name, price, duration_minutes, slot)
    values (
      v_order.id,
      v_item->>'product_id',
      public.product_name(v_item->>'product_id'),
      public.product_price(v_item->>'product_id'),
      public.product_minutes(v_item->>'product_id'),
      v_item->>'slot'
    );
  end loop;

  return public.get_order_payload(p_code);
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
    'status', case when o.status = 'pending' and o.expires_at < now() then 'expired' else o.status::text end,
    'expires_at', o.expires_at,
    'created_at', o.created_at,
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

create or replace function public.staff_list_orders(p_session_token uuid, p_query text default null)
returns setof jsonb
language sql
security definer
set search_path = public
as $$
  select public.get_order_payload(o.code)
  from public.orders o
  where public.is_staff_session(p_session_token)
    and (p_query is null or o.code ilike '%' || p_query || '%')
  order by o.created_at desc
  limit 100;
$$;

create or replace function public.staff_update_order_status(p_session_token uuid, p_code text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff_session(p_session_token) then
    raise exception 'Sesion no autorizada';
  end if;

  update public.orders set status = p_status::order_status where code = p_code;
  return public.get_order_payload(p_code);
end;
$$;

create or replace function public.staff_update_order_details(
  p_session_token uuid,
  p_code text,
  p_customer_name text,
  p_document_number text,
  p_email text,
  p_phone text,
  p_comments text,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff_session(p_session_token) then
    raise exception 'Sesion no autorizada';
  end if;

  update public.orders set
    customer_name = trim(p_customer_name),
    document_number = trim(p_document_number),
    email = trim(p_email),
    phone = trim(p_phone),
    comments = nullif(trim(coalesce(p_comments, '')), ''),
    payment_method = p_payment_method
  where code = p_code;

  return public.get_order_payload(p_code);
end;
$$;

create or replace function public.staff_daily_report(p_session_token uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with today_orders as (
    select * from public.orders
    where created_at >= date_trunc('day', now())
      and public.is_staff_session(p_session_token, 'admin')
  ),
  today_items as (
    select i.*
    from public.order_items i
    join today_orders o on o.id = i.order_id
  ),
  payment_top as (
    select payment_method from today_orders group by payment_method order by count(*) desc limit 1
  ),
  slot_top as (
    select slot from today_items group by slot order by count(*) desc limit 1
  )
  select jsonb_build_object(
    'total_orders', (select count(*) from today_orders),
    'entries_sold', (select count(*) from today_items),
    'full_pass', (select count(*) from today_items where product_id = 'full_pass'),
    'standard', (select count(*) from today_items where product_id = 'standard'),
    'premium_kids', (select count(*) from today_items where product_id = 'premium_kids'),
    'kids_normal', (select count(*) from today_items where product_id = 'kids_normal'),
    'photo_packs', (select count(*) from today_orders where photo_pack <> 'none'),
    'premium_conversion', coalesce(round(100.0 * (select count(*) from today_items where product_id in ('full_pass', 'premium_kids')) / nullif((select count(*) from today_items), 0), 1), 0),
    'average_ticket', coalesce(round((select avg(total) from today_orders), 2), 0),
    'estimated_total', coalesce((select sum(total) from today_orders), 0),
    'top_payment_method', (select payment_method from payment_top),
    'top_slot', (select slot from slot_top),
    'photo_percentage', coalesce(round(100.0 * (select count(*) from today_orders where photo_pack <> 'none') / nullif((select count(*) from today_orders), 0), 1), 0)
  );
$$;

insert into public.staff_users(username, password_hash, role)
values
  ('caja', crypt('yaku123', gen_salt('bf')), 'caja'),
  ('admin', crypt('admin123', gen_salt('bf')), 'admin')
on conflict (username) do update
set password_hash = excluded.password_hash,
    role = excluded.role;

grant usage on schema public to anon, authenticated;
grant execute on function public.staff_login(text, text) to anon, authenticated;
grant execute on function public.create_public_order(text, text, text, uuid, text, jsonb, text, text, text, text) to anon;
grant execute on function public.create_public_order(text, text, text, uuid, text, jsonb, text, text, text, text) to authenticated;
grant execute on function public.update_public_order(text, uuid, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.staff_list_orders(uuid, text) to anon, authenticated;
grant execute on function public.staff_update_order_status(uuid, text, text) to anon, authenticated;
grant execute on function public.staff_update_order_details(uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.staff_daily_report(uuid) to anon, authenticated;
grant execute on function public.get_order_payload(text) to anon, authenticated;

notify pgrst, 'reload schema';
