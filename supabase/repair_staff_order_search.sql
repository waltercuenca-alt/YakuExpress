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

create or replace function public.staff_list_orders(
  p_session_token uuid,
  p_query text default null
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
        when raw_query ~ '^[0-9]+$' then 'YAKU-' || lpad(raw_query, 4, '0')
        when raw_query ~ '^YAKU-[0-9]+$' then 'YAKU-' || lpad(split_part(raw_query, '-', 2), 4, '0')
        else raw_query
      end as normalized_code
    from normalized
  )
  select public.get_order_payload(o.code)
  from public.orders o
  cross join search_terms s
  where public.is_staff_session(p_session_token)
    and (
      s.raw_query is null
      or upper(o.code) = s.normalized_code
      or upper(o.code) ilike '%' || s.raw_query || '%'
    )
  order by o.created_at desc
  limit 100;
$$;

grant execute on function public.is_staff_session(uuid, text) to anon;
grant execute on function public.is_staff_session(uuid, text) to authenticated;

grant execute on function public.staff_list_orders(uuid, text) to anon;
grant execute on function public.staff_list_orders(uuid, text) to authenticated;

notify pgrst, 'reload schema';
