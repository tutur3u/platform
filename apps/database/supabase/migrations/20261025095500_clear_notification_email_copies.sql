set local lock_timeout = '1s';

create or replace function private.clear_notification_email_copy_batch(
  p_batch_size integer default 500
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_updated integer;
  v_payload_check text;
begin
  if p_batch_size < 1 or p_batch_size > 5000 then
    raise exception 'Batch size must be between 1 and 5000';
  end if;

  select pg_catalog.pg_get_expr(conbin, conrelid)
  into v_payload_check
  from pg_catalog.pg_constraint
  where conrelid = 'public.notifications'::regclass
    and conname = 'data_strict_payload_size_check'
    and contype = 'c';

  execute format($batch$
  with candidates as (
    select n.ctid
    from public.notifications as n
    where n.user_id is not null
      and n.email is not null
      and (%s) is not false
    order by n.id
    limit $1
    for update skip locked
  )
  update public.notifications as n
  set email = null
  from candidates
  where n.ctid = candidates.ctid
  $batch$, coalesce(v_payload_check, 'true')) using p_batch_size;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function private.clear_notification_email_copy_batch(integer)
  from public, anon, authenticated, service_role;

do $$
declare
  v_updated integer;
  v_constraint_name text;
  v_constraint_definition text;
  v_payload_check text;
  v_has_oversized boolean;
begin
  loop
    v_updated := private.clear_notification_email_copy_batch(500);
    exit when v_updated = 0;
  end loop;

  select conname, pg_catalog.pg_get_constraintdef(oid),
    pg_catalog.pg_get_expr(conbin, conrelid)
  into v_constraint_name, v_constraint_definition, v_payload_check
  from pg_catalog.pg_constraint
  where conrelid = 'public.notifications'::regclass
    and conname = 'data_strict_payload_size_check'
    and contype = 'c';

  if v_constraint_name is not null then
    execute format(
      'select exists (select 1 from public.notifications
       where user_id is not null and email is not null and (%s) is false)',
      v_payload_check) into v_has_oversized;

    -- Take the table lock only for legacy rows rejected by the original check.
    if v_has_oversized then
      execute format('alter table public.notifications drop constraint %I',
        v_constraint_name);

      execute format(
        'update public.notifications set email = null
         where user_id is not null and email is not null and (%s) is false',
        v_payload_check);

      execute format('alter table public.notifications add constraint %I %s%s',
        v_constraint_name,
        v_constraint_definition,
        case when v_constraint_definition ~ ' NOT VALID$'
          then '' else ' NOT VALID' end);
    end if;
  end if;

  if exists (
    select 1
    from public.notifications
    where user_id is not null
      and email is not null
  ) then
    raise exception 'Notification email-copy cleanup was incomplete';
  end if;
end;
$$;
