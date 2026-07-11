create table if not exists public.turn_operation_records (
  id uuid primary key default gen_random_uuid(),
  operation_date date not null unique,
  photographer_name text not null,
  camera_delivered boolean not null default false,
  delivered_at time not null default '09:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.turn_operation_records enable row level security;

drop policy if exists "turn operation records public insert" on public.turn_operation_records;
drop policy if exists "turn operation records public select" on public.turn_operation_records;
drop policy if exists "turn operation records public update" on public.turn_operation_records;

create policy "turn operation records public insert"
on public.turn_operation_records
for insert
to anon, authenticated
with check (true);

create policy "turn operation records public select"
on public.turn_operation_records
for select
to anon, authenticated
using (true);

create policy "turn operation records public update"
on public.turn_operation_records
for update
to anon, authenticated
using (true)
with check (true);
