create extension if not exists pgcrypto;

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

alter table public.staff_users enable row level security;
alter table public.staff_sessions enable row level security;

drop policy if exists "No direct staff users" on public.staff_users;
drop policy if exists "No direct staff sessions" on public.staff_sessions;

create policy "No direct staff users"
on public.staff_users
for all
using (false)
with check (false);

create policy "No direct staff sessions"
on public.staff_sessions
for all
using (false)
with check (false);

insert into public.staff_users(username, password_hash, role)
values
  ('caja', crypt('yaku123', gen_salt('bf')), 'caja'),
  ('admin', crypt('admin123', gen_salt('bf')), 'admin')
on conflict (username) do update
set password_hash = excluded.password_hash,
    role = excluded.role;

create or replace function public.staff_login(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.staff_users%rowtype;
  v_token uuid;
begin
  select *
  into v_user
  from public.staff_users
  where username = lower(trim(p_username));

  if v_user.id is null then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  if v_user.password_hash <> crypt(p_password, v_user.password_hash) then
    return jsonb_build_object('ok', false, 'error', 'invalid_password');
  end if;

  insert into public.staff_sessions(user_id)
  values (v_user.id)
  returning token into v_token;

  return jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'role', v_user.role,
    'username', v_user.username
  );
end;
$$;

create or replace function public.is_staff_session(
  p_token uuid,
  p_role text default null
)
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

grant usage on schema public to anon;
grant usage on schema public to authenticated;

grant execute on function public.staff_login(text, text) to anon;
grant execute on function public.staff_login(text, text) to authenticated;

grant execute on function public.is_staff_session(uuid, text) to anon;
grant execute on function public.is_staff_session(uuid, text) to authenticated;

notify pgrst, 'reload schema';
