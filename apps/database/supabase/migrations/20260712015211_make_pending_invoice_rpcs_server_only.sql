-- Pending invoice reads are served exclusively through the Finance API, which
-- verifies the signed-in actor's view_invoices permission before using the
-- service-role client. Keep the original permission guard as the implementation
-- and add a server-only entry point that supplies the service-role claim in the
-- database transaction.
alter function public.get_pending_invoices_base(uuid, boolean)
rename to get_pending_invoices_base_guarded;

revoke all on function public.get_pending_invoices_base_guarded(uuid, boolean)
from public, anon, authenticated, service_role;

create or replace function public.get_pending_invoices_base(
  p_ws_id uuid,
  p_use_attendance_based boolean default true
)
returns table (
  user_id uuid,
  user_name text,
  user_avatar_url text,
  group_id uuid,
  group_name text,
  month text,
  sessions date[],
  attendance_days integer,
  billable_days integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('role', 'service_role')::text,
    true
  );

  return query
  select *
  from public.get_pending_invoices_base_guarded(
    p_ws_id,
    p_use_attendance_based
  );
end;
$$;

revoke all on function public.get_pending_invoices_base(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.get_pending_invoices_base(uuid, boolean)
to service_role;

revoke all on function public.get_pending_invoices(
  uuid,
  integer,
  integer,
  text,
  uuid[]
) from public, anon, authenticated;
grant execute on function public.get_pending_invoices(
  uuid,
  integer,
  integer,
  text,
  uuid[]
) to service_role;

revoke all on function public.get_pending_invoices_count(uuid, text, uuid[])
from public, anon, authenticated;
grant execute on function public.get_pending_invoices_count(uuid, text, uuid[])
to service_role;

revoke all on function public.get_pending_invoices_grouped_by_user(
  uuid,
  integer,
  integer,
  text,
  uuid[]
) from public, anon, authenticated;
grant execute on function public.get_pending_invoices_grouped_by_user(
  uuid,
  integer,
  integer,
  text,
  uuid[]
) to service_role;

revoke all on function public.get_pending_invoices_grouped_by_user_count(
  uuid,
  text,
  uuid[]
) from public, anon, authenticated;
grant execute on function public.get_pending_invoices_grouped_by_user_count(
  uuid,
  text,
  uuid[]
) to service_role;
