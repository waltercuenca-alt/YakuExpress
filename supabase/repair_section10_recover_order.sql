create or replace function public.get_public_order_by_code(
  p_code text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with normalized as (
    select
      case
        when nullif(upper(trim(coalesce(p_code, ''))), '') is null then null
        when upper(trim(p_code)) ~ '^[0-9]+$' then 'YAKU-' || lpad(upper(trim(p_code)), 4, '0')
        when upper(trim(p_code)) ~ '^YAKU-[0-9]+$' then 'YAKU-' || lpad(split_part(upper(trim(p_code)), '-', 2), 4, '0')
        else upper(trim(p_code))
      end as code
  )
  select public.get_order_payload(o.code)
  from public.orders o
  join normalized n on upper(o.code) = n.code
  limit 1;
$$;

grant execute on function public.get_public_order_by_code(text) to anon;
grant execute on function public.get_public_order_by_code(text) to authenticated;

notify pgrst, 'reload schema';
