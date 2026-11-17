-- Mail × Contacts: the workspace a mailbox belongs to, per-mailbox sender
-- blocks, and the Contacts "blocked in Mail" flag.
--
-- * private.mail_mailboxes.ws_id: the workspace whose Contacts a mailbox uses
--   by default. Personal mailboxes are backfilled to their owner's personal
--   workspace; shared mailboxes stay null until an administrator links them.
-- * private.mail_sender_blocks: address or domain blocks evaluated at ingest.
--   Blocked mail is stored and labelled `blocked` instead of `inbox`; nothing
--   is deleted. Service-role access only, like every private mail table.
-- * public.workspace_users.mail_blocked: a mirror of whether any mailbox of
--   the contact's workspace blocks the contact's address. Only the service
--   role (or a database owner) may change it, so a direct member write cannot
--   fake the state. The guard runs as the invoker, so current_user is the
--   effective API role.
--   SECURITY DEFINER functions that write workspace_users must keep
--   mail_blocked out of client-supplied input: the guard trusts
--   current_user, which is the definer inside such functions. The existing
--   definer writers (admin_create/update_workspace_user_with_audit_actor and
--   the merge functions) use explicit column lists without mail_blocked.

alter table private.mail_mailboxes
  add column ws_id uuid references public.workspaces(id) on delete set null;

create index mail_mailboxes_ws_id_idx
  on private.mail_mailboxes (ws_id)
  where ws_id is not null;

-- Links an unlinked personal mailbox to its owner's personal workspace only
-- when the link is unambiguous: exactly one owner member, who is also the
-- mailbox creator and has exactly one personal workspace. Company-provisioned
-- employee mailboxes (private.infrastructure_employees.mailbox_id) and
-- adopted retained mailboxes (private.employee_mailbox_adoptions) stay null
-- for an administrator to link. Idempotent. With p_mailbox_id it considers
-- only that mailbox, which Mail calls after creating a personal mailbox.
create or replace function private.link_personal_mailbox_workspaces(
  p_mailbox_id uuid default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  linked integer;
begin
  with candidates as (
    select mailbox.id as mailbox_id, min(member.user_id::text)::uuid as owner_id
    from private.mail_mailboxes as mailbox
    join private.mail_mailbox_members as member
      on member.mailbox_id = mailbox.id and member.role = 'owner'
    where mailbox.type = 'personal'
      and mailbox.ws_id is null
      and (p_mailbox_id is null or mailbox.id = p_mailbox_id)
      and not exists (
        select 1 from private.infrastructure_employees as employee
        where employee.mailbox_id = mailbox.id
      )
      and not exists (
        select 1 from private.employee_mailbox_adoptions as adoption
        where adoption.mailbox_id = mailbox.id
      )
    group by mailbox.id, mailbox.created_by
    having count(*) = 1 and min(member.user_id::text)::uuid = mailbox.created_by
  ),
  targets as (
    select candidate.mailbox_id, min(workspace.id::text)::uuid as ws_id
    from candidates as candidate
    join public.workspaces as workspace
      on workspace.creator_id = candidate.owner_id and workspace.personal = true
    group by candidate.mailbox_id
    having count(*) = 1
  )
  update private.mail_mailboxes as mailbox
  set ws_id = target.ws_id
  from targets as target
  where mailbox.id = target.mailbox_id
    and mailbox.ws_id is null;
  get diagnostics linked = row_count;
  return linked;
end;
$$;

revoke all on function private.link_personal_mailbox_workspaces(uuid)
  from public, anon, authenticated;
grant execute on function private.link_personal_mailbox_workspaces(uuid)
  to service_role;

select private.link_personal_mailbox_workspaces();

create table private.mail_sender_blocks (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null
    references private.mail_mailboxes(id) on delete cascade,
  kind text not null check (kind in ('address', 'domain')),
  value text not null,
  contact_id uuid references public.workspace_users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mail_sender_blocks_value_shape check (
    value = lower(value)
    and char_length(value) between 3 and 320
    and (
      (kind = 'address' and value ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
      or (kind = 'domain' and value ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$')
    )
  ),
  unique (mailbox_id, kind, value)
);

create index mail_sender_blocks_contact_id_idx
  on private.mail_sender_blocks (contact_id)
  where contact_id is not null;

alter table private.mail_sender_blocks enable row level security;

revoke all on table private.mail_sender_blocks from public, anon, authenticated;

grant select, insert, update, delete on table private.mail_sender_blocks
  to service_role;

alter table public.workspace_users
  add column mail_blocked boolean not null default false;

create or replace function public.guard_workspace_user_mail_blocked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mail_blocked is distinct from
      (case when tg_op = 'INSERT' then false else old.mail_blocked end)
    and current_user not in ('service_role', 'postgres', 'supabase_admin')
  then
    raise exception 'mail_blocked is managed by Mail'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_workspace_user_mail_blocked()
  from public, anon, authenticated;

create trigger guard_workspace_user_mail_blocked
  before insert or update of mail_blocked on public.workspace_users
  for each row
  execute function public.guard_workspace_user_mail_blocked();
