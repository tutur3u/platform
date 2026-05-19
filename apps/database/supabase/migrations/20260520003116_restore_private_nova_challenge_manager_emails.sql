-- Restore Nova challenge manager assignments as a server-owned private table.
--
-- The public cleanup migration removed the public REST surface for this table,
-- but Nova still needs the assignment data for server-side challenge access.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

do $$
begin
  if to_regclass('public.nova_challenge_manager_emails') is not null then
    alter table public.nova_challenge_manager_emails
      set schema private;
  else
    create table if not exists private.nova_challenge_manager_emails (
      challenge_id uuid not null,
      email text not null,
      created_at timestamp with time zone not null default now()
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'nova_challenge_manager_emails_pkey'
      and conrelid = 'private.nova_challenge_manager_emails'::regclass
  ) then
    alter table private.nova_challenge_manager_emails
      add constraint nova_challenge_manager_emails_pkey
      primary key (challenge_id, email);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'nova_challenge_manager_emails_challenge_id_fkey'
      and conrelid = 'private.nova_challenge_manager_emails'::regclass
  ) then
    alter table private.nova_challenge_manager_emails
      add constraint nova_challenge_manager_emails_challenge_id_fkey
      foreign key (challenge_id)
      references public.nova_challenges(id)
      on update cascade
      on delete cascade;
  end if;
end;
$$;

revoke all on table private.nova_challenge_manager_emails
from public, anon, authenticated;

grant all on table private.nova_challenge_manager_emails to service_role;

alter table private.nova_challenge_manager_emails enable row level security;

drop policy if exists "Service role can manage private Nova challenge managers"
  on private.nova_challenge_manager_emails;

create policy "Service role can manage private Nova challenge managers"
  on private.nova_challenge_manager_emails
  for all
  to service_role
  using (true)
  with check (true);

comment on table private.nova_challenge_manager_emails is
  'Server-owned Nova challenge manager email assignments. Access through service-role server code only.';
