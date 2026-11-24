set local lock_timeout = '2s';
set local statement_timeout = '10s';

alter table public.workspace_user_groups add column updated_at timestamptz;
alter table public.workspace_user_groups_users add column updated_at timestamptz;

-- tuturuuu: no-grant (trigger)
create function private.stamp_class_membership_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := clock_timestamp();
  else
    new.updated_at := old.updated_at;
    if new is distinct from old then
      new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.stamp_class_membership_updated_at()
  from public, anon, authenticated, service_role;

create trigger stamp_class_updated_at
before insert or update on public.workspace_user_groups
for each row execute function private.stamp_class_membership_updated_at();

create trigger stamp_class_membership_updated_at
before insert or update on public.workspace_user_groups_users
for each row execute function private.stamp_class_membership_updated_at();
