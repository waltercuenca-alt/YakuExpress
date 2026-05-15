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

grant execute on function public.create_public_order(text, text, text, uuid, text, jsonb, text, text, text, text) to anon;
grant execute on function public.create_public_order(text, text, text, uuid, text, jsonb, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
