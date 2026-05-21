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

drop function if exists public.staff_update_order_status(uuid, text, text);
drop function if exists public.staff_update_order_status(text, uuid, text);

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

  v_status := case lower(trim(p_status))
    when 'pedido_creado' then 'pedido_creado'::public.order_status
    when 'pending' then 'pedido_creado'::public.order_status
    when 'cliente_en_caja' then 'cliente_en_caja'::public.order_status
    when 'pago_procesado' then 'pago_procesado'::public.order_status
    when 'paid' then 'pago_procesado'::public.order_status
    when 'finalizado' then 'finalizado'::public.order_status
    when 'in_fazzure' then 'finalizado'::public.order_status
    when 'problema_demora' then 'problema_demora'::public.order_status
    when 'cancelled' then 'problema_demora'::public.order_status
    else p_status::public.order_status
  end;

  update public.orders
  set status = v_status
  where upper(code) = v_code;

  if not found then
    raise exception 'Pedido no encontrado: %', p_code;
  end if;

  return public.get_order_payload(v_code);
end;
$$;

drop function if exists public.staff_update_order_details(uuid, text, text, text, text, text, text, text);
drop function if exists public.staff_update_order_details(text, text, text, text, text, text, text, uuid);

create or replace function public.staff_update_order_details(
  p_code text,
  p_comments text,
  p_customer_name text,
  p_document_number text,
  p_email text,
  p_payment_method text,
  p_phone text,
  p_session_token uuid
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
    customer_name = trim(p_customer_name),
    document_number = trim(p_document_number),
    email = trim(p_email),
    phone = trim(p_phone),
    comments = nullif(trim(coalesce(p_comments, '')), ''),
    payment_method = trim(p_payment_method)
  where upper(code) = v_code;

  if not found then
    raise exception 'Pedido no encontrado: %', p_code;
  end if;

  return public.get_order_payload(v_code);
end;
$$;

grant execute on function public.is_staff_session(uuid, text) to anon;
grant execute on function public.is_staff_session(uuid, text) to authenticated;

grant execute on function public.staff_update_order_status(text, uuid, text) to anon;
grant execute on function public.staff_update_order_status(text, uuid, text) to authenticated;

grant execute on function public.staff_update_order_details(text, text, text, text, text, text, text, uuid) to anon;
grant execute on function public.staff_update_order_details(text, text, text, text, text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
