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
      or o.status::text = trim(p_status)
      or (trim(p_status) = 'pedido_creado' and o.status::text = 'pending')
      or (trim(p_status) = 'pago_procesado' and o.status::text = 'paid')
      or (trim(p_status) = 'finalizado' and o.status::text = 'in_fazzure')
      or (trim(p_status) = 'problema_demora' and o.status::text = 'cancelled')
    )
  order by o.created_at desc;
$$;

create or replace function public.staff_daily_report(
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
    where created_at >= date_trunc('day', now())
      and created_at < date_trunc('day', now()) + interval '1 day'
      and public.is_staff_session(p_session_token, 'admin')
  ),
  today_items as (
    select i.*
    from public.order_items i
    join today_orders o on o.id = i.order_id
  ),
  payment_top as (
    select payment_method
    from today_orders
    group by payment_method
    order by count(*) desc
    limit 1
  ),
  slot_top as (
    select slot
    from today_items
    group by slot
    order by count(*) desc
    limit 1
  )
  select jsonb_build_object(
    'total_orders', (select count(*) from today_orders),
    'entries_sold', (select count(*) from today_items),
    'full_pass', (select count(*) from today_items where product_id = 'full_pass'),
    'standard', (select count(*) from today_items where product_id = 'standard'),
    'premium_kids', (select count(*) from today_items where product_id = 'premium_kids'),
    'kids_normal', (select count(*) from today_items where product_id = 'kids_normal'),
    'photo_packs', (select count(*) from today_orders where photo_pack <> 'none'),
    'photo_percentage', coalesce(round(100.0 * (select count(*) from today_orders where photo_pack <> 'none') / nullif((select count(*) from today_orders), 0), 1), 0),
    'full_pass_conversion', coalesce(round(100.0 * (select count(*) from today_items where product_id = 'full_pass') / nullif((select count(*) from today_items), 0), 1), 0),
    'premium_conversion', coalesce(round(100.0 * (select count(*) from today_items where product_id in ('full_pass', 'premium_kids')) / nullif((select count(*) from today_items), 0), 1), 0),
    'average_ticket', coalesce(round((select avg(total) from today_orders), 2), 0),
    'estimated_total', coalesce((select sum(total) from today_orders), 0),
    'top_payment_method', (select payment_method from payment_top),
    'top_slot', (select slot from slot_top)
  );
$$;

grant execute on function public.is_staff_session(uuid, text) to anon;
grant execute on function public.is_staff_session(uuid, text) to authenticated;

grant execute on function public.staff_list_today_orders(uuid, text) to anon;
grant execute on function public.staff_list_today_orders(uuid, text) to authenticated;

grant execute on function public.staff_daily_report(uuid) to anon;
grant execute on function public.staff_daily_report(uuid) to authenticated;

notify pgrst, 'reload schema';
