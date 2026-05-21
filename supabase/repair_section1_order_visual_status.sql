-- SECCION 1: Estado visual de pedidos
-- SQL seguro para ejecutar en Supabase SQL Editor.
-- Agrega los estados operativos nuevos y mantiene compatibilidad con estados anteriores.

do $$
begin
  alter type public.order_status add value if not exists 'pedido_creado';
  alter type public.order_status add value if not exists 'cliente_en_caja';
  alter type public.order_status add value if not exists 'pago_procesado';
  alter type public.order_status add value if not exists 'finalizado';
  alter type public.order_status add value if not exists 'problema_demora';
exception
  when undefined_object then
    raise exception 'No existe el enum public.order_status. Ejecuta primero el esquema base de YakuExpress.';
end $$;

alter table public.orders
  alter column status set default 'pedido_creado'::public.order_status;

create or replace function public.normalize_staff_order_status(p_status text)
returns public.order_status
language plpgsql
stable
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if v_status in ('pedido_creado', 'pending') then
    return 'pedido_creado'::public.order_status;
  elsif v_status = 'cliente_en_caja' then
    return 'cliente_en_caja'::public.order_status;
  elsif v_status in ('pago_procesado', 'paid') then
    return 'pago_procesado'::public.order_status;
  elsif v_status in ('finalizado', 'in_fazzure') then
    return 'finalizado'::public.order_status;
  elsif v_status in ('problema_demora', 'cancelled') then
    return 'problema_demora'::public.order_status;
  elsif v_status = 'expired' then
    return 'expired'::public.order_status;
  end if;

  raise exception 'Estado de pedido no valido: %', p_status;
end;
$$;

create or replace function public.staff_update_order_status(
  p_code text,
  p_session_token uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(p_code));
  v_status public.order_status;
begin
  if not public.is_staff_session(p_session_token) then
    raise exception 'Sesion no autorizada';
  end if;

  v_status := public.normalize_staff_order_status(p_status);

  update public.orders
  set status = v_status
  where upper(code) = v_code;

  if not found then
    raise exception 'Pedido no encontrado: %', p_code;
  end if;

  return public.get_order_payload(v_code);
end;
$$;

create or replace function public.staff_list_today_orders(
  p_session_token uuid,
  p_status text default null
)
returns setof jsonb
language sql
security definer
set search_path = public
as $$
  select public.get_order_payload(o.code)
  from public.orders o
  where public.is_staff_session(p_session_token)
    and o.created_at >= date_trunc('day', now())
    and o.created_at < date_trunc('day', now()) + interval '1 day'
    and (
      nullif(trim(coalesce(p_status, '')), '') is null
      or o.status = public.normalize_staff_order_status(p_status)
      or (trim(p_status) = 'pedido_creado' and o.status::text = 'pending')
      or (trim(p_status) = 'pago_procesado' and o.status::text = 'paid')
      or (trim(p_status) = 'finalizado' and o.status::text = 'in_fazzure')
      or (trim(p_status) = 'problema_demora' and o.status::text = 'cancelled')
    )
  order by o.created_at desc;
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
    status = 'pago_procesado'::public.order_status,
    updated_at = now()
  where upper(code) = v_code;

  if not found then
    raise exception 'Pedido no encontrado: %', p_code;
  end if;

  return public.get_order_payload(v_code);
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
    'status', case when o.status::text in ('pedido_creado', 'pending') and o.expires_at < now() then 'expired' else o.status::text end,
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

grant execute on function public.normalize_staff_order_status(text) to anon, authenticated;
grant execute on function public.staff_update_order_status(text, uuid, text) to anon, authenticated;
grant execute on function public.staff_list_today_orders(uuid, text) to anon, authenticated;
grant execute on function public.staff_cashier_summary_today(uuid) to anon, authenticated;
grant execute on function public.staff_quick_charge(uuid, text, text) to anon, authenticated;
grant execute on function public.get_order_payload(text) to anon, authenticated;

notify pgrst, 'reload schema';
