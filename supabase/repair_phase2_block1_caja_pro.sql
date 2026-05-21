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

create or replace function public.staff_cashier_summary_today(
  p_session_token uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with today_orders as (
    select *
    from public.orders
    where public.is_staff_session(p_session_token)
      and created_at >= date_trunc('day', now())
      and created_at < date_trunc('day', now()) + interval '1 day'
  )
  select jsonb_build_object(
    'total_orders', count(*),
    'pedido_creado_orders', count(*) filter (where status::text in ('pedido_creado', 'pending')),
    'cliente_en_caja_orders', count(*) filter (where status::text = 'cliente_en_caja'),
    'pago_procesado_orders', count(*) filter (where status::text in ('pago_procesado', 'paid')),
    'finalizado_orders', count(*) filter (where status::text in ('finalizado', 'in_fazzure')),
    'problema_demora_orders', count(*) filter (where status::text in ('problema_demora', 'cancelled')),
    'pending_orders', count(*) filter (where status::text in ('pedido_creado', 'pending')),
    'paid_orders', count(*) filter (where status::text in ('pago_procesado', 'paid')),
    'in_fazzure_orders', count(*) filter (where status::text in ('finalizado', 'in_fazzure')),
    'cancelled_orders', count(*) filter (where status::text in ('problema_demora', 'cancelled')),
    'total_sales', coalesce(sum(total) filter (where status::text in ('pago_procesado', 'paid', 'finalizado', 'in_fazzure')), 0),
    'avg_ticket', coalesce(round(avg(total) filter (where status::text in ('pago_procesado', 'paid', 'finalizado', 'in_fazzure')), 2), 0)
  )
  from today_orders;
$$;

create or replace function public.staff_search_orders(
  p_session_token uuid,
  p_query text
)
returns setof jsonb
language sql
security definer
set search_path = public
as $$
  with normalized as (
    select
      nullif(upper(trim(coalesce(p_query, ''))), '') as raw_query
  ),
  search_terms as (
    select
      raw_query,
      case
        when raw_query is null then null
        when raw_query ~ '^[0-9]+$' and length(raw_query) <= 4 then 'YAKU-' || lpad(raw_query, 4, '0')
        when raw_query ~ '^YAKU-[0-9]+$' then 'YAKU-' || lpad(split_part(raw_query, '-', 2), 4, '0')
        else raw_query
      end as normalized_code
    from normalized
  )
  select public.get_order_payload(o.code)
  from public.orders o
  cross join search_terms s
  where public.is_staff_session(p_session_token)
    and s.raw_query is not null
    and o.created_at >= now() - interval '7 days'
    and (
      upper(o.code) = s.normalized_code
      or upper(o.code) ilike '%' || s.raw_query || '%'
      or upper(coalesce(o.customer_name, '')) ilike '%' || s.raw_query || '%'
      or upper(coalesce(o.document_number, '')) ilike '%' || s.raw_query || '%'
      or upper(coalesce(o.phone, '')) ilike '%' || s.raw_query || '%'
    )
  order by o.created_at desc
  limit 25;
$$;

create or replace function public.staff_quick_charge(
  p_session_token uuid,
  p_code text,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(p_code));
begin
  if not public.is_staff_session(p_session_token) then
    raise exception 'Sesion no autorizada';
  end if;

  update public.orders
  set
    payment_method = trim(p_payment_method),
    status = 'pago_procesado',
    updated_at = now()
  where upper(code) = v_code;

  if not found then
    raise exception 'Pedido no encontrado: %', p_code;
  end if;

  return public.get_order_payload(v_code);
end;
$$;

grant execute on function public.is_staff_session(uuid, text) to anon;
grant execute on function public.is_staff_session(uuid, text) to authenticated;

grant execute on function public.staff_cashier_summary_today(uuid) to anon;
grant execute on function public.staff_cashier_summary_today(uuid) to authenticated;

grant execute on function public.staff_search_orders(uuid, text) to anon;
grant execute on function public.staff_search_orders(uuid, text) to authenticated;

grant execute on function public.staff_quick_charge(uuid, text, text) to anon;
grant execute on function public.staff_quick_charge(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
