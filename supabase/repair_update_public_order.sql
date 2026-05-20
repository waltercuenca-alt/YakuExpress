drop function if exists public.update_public_order(
  text,
  text,
  text,
  text,
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  text
);

create or replace function public.update_public_order(
  p_code text,
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
  v_code text := upper(trim(p_code));
  v_order public.orders%rowtype;
  v_item jsonb;
  v_total numeric := public.photo_price(p_photo_pack);
begin
  if v_code is null or v_code = '' then
    raise exception 'Codigo de pedido requerido';
  end if;

  select *
    into v_order
  from public.orders
  where upper(code) = v_code
    and edit_token = p_edit_token
  for update;

  if v_order.id is null then
    raise exception 'Pedido no encontrado';
  end if;

  if v_order.status <> 'pending'::public.order_status then
    raise exception 'Solo se puede editar antes del pago';
  end if;

  if v_order.expires_at < now() then
    update public.orders
    set status = 'expired'::public.order_status,
        updated_at = now()
    where id = v_order.id;

    raise exception 'Este pedido expiro. Podes crear uno nuevo.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe tener entradas';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_total := v_total + public.product_price(v_item->>'product_id');
  end loop;

  update public.orders
  set
    receipt_type = p_receipt_type::public.receipt_type,
    customer_name = trim(p_customer_name),
    document_number = trim(p_document_number),
    email = trim(p_email),
    phone = trim(p_phone),
    comments = nullif(trim(coalesce(p_comments, '')), ''),
    payment_method = trim(p_payment_method),
    photo_pack = p_photo_pack,
    total = v_total,
    updated_at = now()
  where id = v_order.id;

  delete from public.order_items
  where order_id = v_order.id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items(
      order_id,
      product_id,
      product_name,
      price,
      duration_minutes,
      slot
    )
    values (
      v_order.id,
      v_item->>'product_id',
      public.product_name(v_item->>'product_id'),
      public.product_price(v_item->>'product_id'),
      public.product_minutes(v_item->>'product_id'),
      v_item->>'slot'
    );
  end loop;

  return public.get_order_payload(v_order.code);
end;
$$;

grant execute on function public.update_public_order(
  text,
  text,
  text,
  text,
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  text
) to anon;

grant execute on function public.update_public_order(
  text,
  text,
  text,
  text,
  uuid,
  text,
  jsonb,
  text,
  text,
  text,
  text
) to authenticated;

notify pgrst, 'reload schema';
