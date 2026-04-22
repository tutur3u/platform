drop function if exists public.ensure_sepay_fallback_transaction_category(uuid, text, boolean);

create or replace function public.ensure_sepay_fallback_transaction_category(
  p_ws_id uuid,
  p_name text,
  p_is_expense boolean
)
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  v_category_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_ws_id::text || ':' || p_name || ':' || p_is_expense::text,
      0
    )
  );

  select id
    into v_category_id
    from public.transaction_categories
   where ws_id = p_ws_id
     and name = p_name
     and is_expense = p_is_expense
   order by created_at asc
   limit 1;

  if v_category_id is not null then
    return v_category_id;
  end if;

  insert into public.transaction_categories (
    color,
    icon,
    is_expense,
    name,
    ws_id
  )
  values (
    null,
    null,
    p_is_expense,
    p_name,
    p_ws_id
  )
  returning id into v_category_id;

  return v_category_id;
end;
$$;

revoke execute on function public.ensure_sepay_fallback_transaction_category(uuid, text, boolean)
from public, anon, authenticated;

grant execute on function public.ensure_sepay_fallback_transaction_category(uuid, text, boolean)
to service_role;
