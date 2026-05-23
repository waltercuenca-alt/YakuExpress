create extension if not exists pgcrypto;

create table if not exists public.photo_orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  customer_code text not null,
  photo_count integer not null check (photo_count > 0),
  total numeric not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'delivered', 'cancelled')),
  created_at timestamp with time zone default now()
);

create table if not exists public.photo_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.photo_orders(id) on delete cascade,
  public_id text not null,
  preview_url text,
  full_url text,
  photo_number integer,
  created_at timestamp with time zone default now()
);

create index if not exists photo_orders_code_idx on public.photo_orders(code);
create index if not exists photo_orders_customer_created_idx on public.photo_orders(customer_code, created_at desc);
create index if not exists photo_order_items_order_id_idx on public.photo_order_items(order_id);

alter table public.photo_orders enable row level security;
alter table public.photo_order_items enable row level security;

do $$
begin
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
