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
begin
  if p_batch_size < 1 or p_batch_size > 5000 then
    raise exception 'Batch size must be between 1 and 5000';
  end if;

  with candidates as (
    select n.ctid
    from public.notifications as n
    where n.user_id is not null
      and n.email is not null
    order by n.id
    limit p_batch_size
    for update skip locked
  )
  update public.notifications as n
  set email = null
  from candidates
  where n.ctid = candidates.ctid;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function private.clear_notification_email_copy_batch(integer)
  from public, anon, authenticated, service_role;

do $$
declare
  v_updated integer;
begin
  loop
    v_updated := private.clear_notification_email_copy_batch(500);
    exit when v_updated = 0;
  end loop;

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
