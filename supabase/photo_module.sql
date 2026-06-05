create extension if not exists pgcrypto;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamp with time zone not null default now()
);

insert into public.app_settings (key, value)
values ('watermark_enabled', 'true'::jsonb)
on conflict (key) do nothing;

create table if not exists public.photo_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text unique,
  client_code text,
  selected_count integer,
  package_type text,
  total_amount numeric not null default 0,
  whatsapp_number text,
  download_token uuid unique default gen_random_uuid(),
  hidden_from_cashier boolean not null default false,
  status text not null default 'pending',
  created_at timestamp with time zone default now()
);

create table if not exists public.photo_order_items (
  id uuid primary key default gen_random_uuid(),
  photo_order_id uuid references public.photo_orders(id) on delete cascade,
  photo_number integer,
  image_url text,
  hd_url text,
  created_at timestamp with time zone default now()
);

alter table public.photo_orders add column if not exists order_code text;
alter table public.photo_orders add column if not exists client_code text;
alter table public.photo_orders add column if not exists selected_count integer;
alter table public.photo_orders add column if not exists package_type text;
alter table public.photo_orders add column if not exists total_amount numeric not null default 0;
alter table public.photo_orders add column if not exists whatsapp_number text;
alter table public.photo_orders add column if not exists download_token uuid default gen_random_uuid();
alter table public.photo_orders add column if not exists hidden_from_cashier boolean not null default false;
alter table public.photo_orders add column if not exists status text not null default 'pending';
alter table public.photo_orders add column if not exists created_at timestamp with time zone default now();
alter table public.photo_orders add column if not exists code text;
alter table public.photo_orders add column if not exists customer_code text;
alter table public.photo_orders add column if not exists photo_count integer;
alter table public.photo_orders add column if not exists total numeric;

alter table public.photo_order_items add column if not exists photo_order_id uuid references public.photo_orders(id) on delete cascade;
alter table public.photo_order_items add column if not exists photo_number integer;
alter table public.photo_order_items add column if not exists image_url text;
alter table public.photo_order_items add column if not exists hd_url text;
alter table public.photo_order_items add column if not exists created_at timestamp with time zone default now();
alter table public.photo_order_items add column if not exists order_id uuid references public.photo_orders(id) on delete cascade;
alter table public.photo_order_items add column if not exists public_id text;
alter table public.photo_order_items add column if not exists preview_url text;
alter table public.photo_order_items add column if not exists full_url text;

update public.photo_orders
set
  order_code = coalesce(order_code, code),
  client_code = coalesce(client_code, customer_code),
  selected_count = coalesce(selected_count, photo_count),
  total_amount = coalesce(total_amount, total),
  package_type = coalesce(package_type,
    case
      when photo_count = 1 then '1 FOTO'
      when photo_count = 2 then '2 FOTOS'
      when photo_count between 3 and 7 then '3 A 7 FOTOS'
      when photo_count >= 8 then 'TODAS LAS FOTOS'
      else 'FOTOS'
    end
  )
where order_code is null
   or client_code is null
   or selected_count is null
   or package_type is null;

update public.photo_orders
set download_token = gen_random_uuid()
where download_token is null;

update public.photo_order_items
set
  photo_order_id = coalesce(photo_order_id, order_id),
  image_url = coalesce(image_url, full_url, preview_url),
  hd_url = coalesce(hd_url, full_url, image_url, preview_url)
where photo_order_id is null
   or image_url is null
   or hd_url is null;

alter table public.photo_orders drop constraint if exists photo_orders_status_check;
alter table public.photo_orders add constraint photo_orders_status_check
  check (status in ('pending', 'processing', 'completed', 'paid', 'delivered', 'cancelled'));

alter table public.photo_orders drop constraint if exists photo_orders_order_code_key;
create unique index if not exists photo_orders_order_code_uidx on public.photo_orders(order_code);
create unique index if not exists photo_orders_download_token_uidx on public.photo_orders(download_token);
create index if not exists photo_orders_status_created_idx on public.photo_orders(status, created_at desc);
create index if not exists photo_orders_client_created_idx on public.photo_orders(client_code, created_at desc);
create index if not exists photo_orders_cashier_visible_created_idx on public.photo_orders(hidden_from_cashier, status, created_at desc);
create index if not exists photo_order_items_photo_order_id_idx on public.photo_order_items(photo_order_id);

alter table public.photo_orders enable row level security;
alter table public.photo_order_items enable row level security;
alter table public.app_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_public_select'
  ) then
    create policy "app_settings_public_select"
      on public.app_settings
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_public_insert'
  ) then
    create policy "app_settings_public_insert"
      on public.app_settings
      for insert
      to anon, authenticated
      with check (key = 'watermark_enabled');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_public_update'
  ) then
    create policy "app_settings_public_update"
      on public.app_settings
      for update
      to anon, authenticated
      using (key = 'watermark_enabled')
      with check (key = 'watermark_enabled');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'photo_orders'
      and policyname = 'photo_orders_public_select'
  ) then
    create policy "photo_orders_public_select"
      on public.photo_orders
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'photo_orders'
      and policyname = 'photo_orders_public_insert'
  ) then
    create policy "photo_orders_public_insert"
      on public.photo_orders
      for insert
      to anon, authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'photo_orders'
      and policyname = 'photo_orders_public_update'
  ) then
    create policy "photo_orders_public_update"
      on public.photo_orders
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'photo_order_items'
      and policyname = 'photo_order_items_public_select'
  ) then
    create policy "photo_order_items_public_select"
      on public.photo_order_items
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'photo_order_items'
      and policyname = 'photo_order_items_public_insert'
  ) then
    create policy "photo_order_items_public_insert"
      on public.photo_order_items
      for insert
      to anon, authenticated
      with check (true);
  end if;
end $$;

grant select, insert, update on public.photo_orders to anon, authenticated;
grant select, insert on public.photo_order_items to anon, authenticated;
grant select, insert, update on public.app_settings to anon, authenticated;

create or replace function public.get_paid_photo_download(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.photo_orders%rowtype;
begin
  select *
    into v_order
    from public.photo_orders
   where download_token = p_token;

  if not found then
    return null;
  end if;

  if v_order.status <> 'completed' then
    return jsonb_build_object(
      'enabled', false,
      'order_code', v_order.order_code,
      'status', v_order.status
    );
  end if;

  return jsonb_build_object(
    'enabled', true,
    'order', jsonb_build_object(
      'id', v_order.id,
      'order_code', v_order.order_code,
      'client_code', v_order.client_code,
      'selected_count', v_order.selected_count,
      'package_type', v_order.package_type,
      'total_amount', v_order.total_amount,
      'status', v_order.status
    ),
    'items', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'photo_number', item.photo_number,
            'image_url', item.image_url,
            'hd_url', coalesce(item.hd_url, item.image_url)
          )
          order by item.photo_number
        ),
        '[]'::jsonb
      )
        from public.photo_order_items item
       where item.photo_order_id = v_order.id
    )
  );
end;
$$;

revoke all on function public.get_paid_photo_download(uuid) from public;
grant execute on function public.get_paid_photo_download(uuid) to anon, authenticated;
-- Turn records / registros de turnos
-- Fase 8B.1 aplicada con RLS conservador: anon/authenticated solo pueden insertar y leer.

create table if not exists public.turn_records (
  id uuid primary key default gen_random_uuid(),
  record_date date not null,
  turn_time text not null,
  photo_code text not null,
  total_people integer not null default 0 check (total_people >= 0),
  standard_count integer not null default 0 check (standard_count >= 0),
  full_pass_count integer not null default 0 check (full_pass_count >= 0),
  kids_count integer not null default 0 check (kids_count >= 0),
  premium_kids_count integer not null default 0 check (premium_kids_count >= 0),
  full_day_count integer not null default 0 check (full_day_count >= 0),
  yakutobogan_count integer not null default 0 check (yakutobogan_count >= 0),
  has_free_photo_benefit boolean not null default false,
  free_photo_redeemed boolean not null default false,
  purchased_extra_photos boolean not null default false,
  notes text,
  customer_whatsapp text,
  source text not null default 'registro-turno',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists turn_records_record_date_idx
  on public.turn_records (record_date);

create index if not exists turn_records_photo_code_idx
  on public.turn_records (photo_code);

create index if not exists turn_records_turn_time_idx
  on public.turn_records (turn_time);

alter table public.turn_records enable row level security;
alter table public.turn_records
  add column if not exists customer_whatsapp text;

comment on column public.turn_records.customer_whatsapp is
  'WhatsApp opcional informado por el grupo para coordinar foto gratis Full Pass. No usar para datos sensibles.';

drop policy if exists "turn_records_insert_anon_authenticated" on public.turn_records;
create policy "turn_records_insert_anon_authenticated"
  on public.turn_records
  for insert
  to anon, authenticated
  with check (
    total_people >= 0
    and standard_count >= 0
    and full_pass_count >= 0
    and kids_count >= 0
    and premium_kids_count >= 0
    and full_day_count >= 0
    and yakutobogan_count >= 0
    and photo_code <> ''
    and source = 'registro-turno'
  );

drop policy if exists "turn_records_select_anon_authenticated" on public.turn_records;
create policy "turn_records_select_anon_authenticated"
  on public.turn_records
  for select
  to anon, authenticated
  using (true);

revoke all on table public.turn_records from public;
revoke all on table public.turn_records from anon;
revoke all on table public.turn_records from authenticated;

grant select, insert on public.turn_records to anon;
grant select, insert on public.turn_records to authenticated;