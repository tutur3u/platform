create table private.mail_mailbox_restorations (
  mailbox_id uuid primary key,
  user_id uuid not null unique,
  previous_status text not null,
  previous_created_by uuid,
  previous_member_ids uuid[] not null,
  previous_member_role text,
  previous_member_created_by uuid,
  previous_ws_id uuid,
  restored_member_id uuid,
  restored_ws_id uuid,
  restored_at timestamptz not null default clock_timestamp()
);

alter table private.mail_mailbox_restorations enable row level security;
revoke all on table private.mail_mailbox_restorations from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
create function private.restore_retained_personal_mailbox(p_user uuid, p_mailbox uuid)
returns void
language plpgsql
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  target record;
  mailbox private.mail_mailboxes%rowtype;
  previous_member private.mail_mailbox_members%rowtype;
  owner_member_id uuid;
  target_domain_id uuid;
begin
  select lower(email) as address, email_confirmed_at, deleted_at, is_anonymous,
    created_at, coalesce(email_change, '') as email_change, banned_until
  into target
  from auth.users
  where id = p_user
  for share;
  if not found then
    -- The target account is absent from fresh local and staging projects.
    raise notice 'Mailbox restoration skipped: Auth user not found';
    return;
  end if;

  if nullif(target.address, '') is null or target.email_confirmed_at is null then
    raise exception 'Mailbox restoration refused: Auth email is missing or unconfirmed';
  end if;
  if target.deleted_at is not null then
    raise exception 'Mailbox restoration refused: Auth user is deleted';
  end if;
  if target.is_anonymous is distinct from false then
    raise exception 'Mailbox restoration refused: Auth user is anonymous';
  end if;
  if target.email_change <> '' then
    raise exception 'Mailbox restoration refused: Auth email change is pending';
  end if;
  if target.banned_until is not null and target.banned_until > clock_timestamp() then
    raise exception 'Mailbox restoration refused: Auth user is banned';
  end if;

  -- Lock order is domain, then mailbox, then memberships, matching the
  -- employee lifecycle functions. The mailbox row lock also fences new
  -- memberships through their foreign key until this transaction finishes.
  select id into target_domain_id from private.mail_domains
  where domain = split_part(target.address, chr(64), 2) and status = 'active'
  for share;
  if target_domain_id is null then
    raise exception 'Mailbox restoration refused: domain is not active';
  end if;

  begin
    select * into strict mailbox
    from private.mail_mailboxes
    where lower(address) = target.address
    for update;
  exception
    when no_data_found then
      raise exception 'Mailbox restoration refused: no matching mailbox';
    when too_many_rows then
      raise exception 'Mailbox restoration refused: multiple matching mailboxes';
  end;

  -- The mailbox id is read and reviewed before activation, so ownership is
  -- pinned positively rather than inferred from records a deletion can clear.
  if mailbox.id is distinct from p_mailbox then
    raise exception 'Mailbox restoration refused: mailbox does not match the reviewed id';
  end if;
  if mailbox.type <> 'personal' then
    raise exception 'Mailbox restoration refused: mailbox is not personal';
  end if;
  if mailbox.archived_at is not null then
    raise exception 'Mailbox restoration refused: mailbox is archived';
  end if;
  if mailbox.domain_id is distinct from target_domain_id then
    raise exception 'Mailbox restoration refused: domain is not active';
  end if;
  if mailbox.created_by is not null and mailbox.created_by <> p_user then
    raise exception 'Mailbox restoration refused: mailbox has a foreign creator';
  end if;
  -- A retained mailbox loses its creator and members when its holder's
  -- account is deleted, so ownership is also proven from history that
  -- survives deletion: the mailbox must not predate the account, and no
  -- adoption, staff binding, message or label may name another person.
  if target.created_at is null or mailbox.created_at < target.created_at then
    raise exception 'Mailbox restoration refused: mailbox predates the account';
  end if;
  if exists (
    select 1 from private.employee_mailbox_adoptions
    where mailbox_id = mailbox.id and request->>'userId' is distinct from p_user::text
  ) then
    raise exception 'Mailbox restoration refused: mailbox has a foreign adoption';
  end if;
  if exists (
    select 1 from private.infrastructure_employees
    where (mailbox_id = mailbox.id or staff_email = target.address) and user_id <> p_user
  ) then
    raise exception 'Mailbox restoration refused: mailbox has a foreign staff binding';
  end if;
  if exists (
    select 1 from private.mail_messages
    where mailbox_id = mailbox.id and created_by is not null and created_by <> p_user
  ) then
    raise exception 'Mailbox restoration refused: mailbox has a foreign message author';
  end if;
  if exists (
    select 1 from private.mail_labels
    where mailbox_id = mailbox.id and created_by is not null and created_by <> p_user
  ) then
    raise exception 'Mailbox restoration refused: mailbox has a foreign label author';
  end if;
  if exists (
    select 1 from private.mail_mcp_credential_mailboxes binding
    join private.mail_mcp_credentials credential on credential.id = binding.credential_id
    where binding.mailbox_id = mailbox.id and credential.created_by <> p_user
  ) then
    raise exception 'Mailbox restoration refused: mailbox has a foreign credential';
  end if;
  if mailbox.ws_id is not null and not exists (
    select 1 from public.workspaces
    where id = mailbox.ws_id and creator_id = p_user and personal
  ) then
    raise exception 'Mailbox restoration refused: mailbox is linked to a foreign workspace';
  end if;
  if exists (
    select 1 from private.employee_creation_operations
    where staff_email = target.address and target_id <> p_user
  ) or exists (
    select 1 from private.employee_creation_intents
    where staff_email = target.address and user_id <> p_user
  ) or exists (
    select 1 from private.employee_restore_operations
    where staff_email = target.address and user_id <> p_user
  ) or exists (
    select 1 from private.employee_address_migrations
    where (source_address = target.address or destination_address = target.address)
      and user_id <> p_user
  ) then
    raise exception 'Mailbox restoration refused: address has a foreign employee record';
  end if;

  perform 1 from private.mail_mailbox_members
  where mailbox_id = mailbox.id
  order by user_id
  for update;
  if exists (
    select 1 from private.mail_mailbox_members
    where mailbox_id = mailbox.id and user_id <> p_user
  ) then
    raise exception 'Mailbox restoration refused: mailbox has a foreign member';
  end if;
  select * into previous_member from private.mail_mailbox_members
  where mailbox_id = mailbox.id and user_id = p_user;

  if mailbox.status = 'active' and mailbox.created_by = p_user
    and previous_member.role = 'owner' then
    raise notice 'Mailbox restoration skipped: mailbox % is already active with its owner', mailbox.id;
    return;
  end if;
  if mailbox.status <> 'disabled' then
    raise exception 'Mailbox restoration refused: mailbox is not disabled';
  end if;

  raise notice 'Mailbox restoration preimage: mailbox_id=%, previous_status=%, previous_created_by=%, member_count=%',
    mailbox.id, mailbox.status, mailbox.created_by,
    case when previous_member.id is null then 0 else 1 end;

  insert into private.mail_mailbox_restorations (
    mailbox_id, user_id, previous_status, previous_created_by, previous_member_ids,
    previous_member_role, previous_member_created_by, previous_ws_id
  ) values (
    mailbox.id, p_user, mailbox.status, mailbox.created_by,
    case when previous_member.id is null then array[]::uuid[] else array[p_user] end,
    previous_member.role, previous_member.created_by, mailbox.ws_id
  );

  update private.mail_mailboxes
  set status = 'active', created_by = p_user
  where id = mailbox.id;

  insert into private.mail_mailbox_members (mailbox_id, user_id, role, created_by)
  values (mailbox.id, p_user, 'owner', p_user)
  on conflict (mailbox_id, user_id) do update set
    role = excluded.role, created_by = excluded.created_by
  returning id into owner_member_id;

  if to_regprocedure('private.link_personal_mailbox_workspaces(uuid)') is not null then
    perform private.link_personal_mailbox_workspaces(mailbox.id);
  end if;

  update private.mail_mailbox_restorations as receipt
  set restored_member_id = owner_member_id, restored_ws_id = current_mailbox.ws_id
  from private.mail_mailboxes as current_mailbox
  where receipt.mailbox_id = mailbox.id and current_mailbox.id = mailbox.id;
end;
$$;

-- tuturuuu: no-grant (internal)
create function private.rollback_retained_personal_mailbox_restoration(p_user uuid)
returns void
language plpgsql
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  receipt private.mail_mailbox_restorations%rowtype;
  mailbox private.mail_mailboxes%rowtype;
  owner_member private.mail_mailbox_members%rowtype;
begin
  select * into receipt from private.mail_mailbox_restorations where user_id = p_user;
  if not found then
    -- Restoration skips projects without the account, so the rollback does too.
    if not exists (select 1 from auth.users where id = p_user) then
      raise notice 'Mailbox restoration rollback skipped: Auth user not found';
      return;
    end if;
    raise exception 'Mailbox restoration rollback refused: restoration receipt is missing';
  end if;

  -- Use the same lock order as restoration and refresh the receipt after waiting.
  select * into mailbox from private.mail_mailboxes where id = receipt.mailbox_id for update;
  if not found then
    raise exception 'Mailbox restoration rollback refused: restored mailbox is missing';
  end if;
  select * into receipt from private.mail_mailbox_restorations
  where mailbox_id = mailbox.id and user_id = p_user
  for update;
  if not found then
    raise exception 'Mailbox restoration rollback refused: restoration receipt is missing';
  end if;

  perform 1 from private.mail_mailbox_members
  where mailbox_id = mailbox.id
  order by user_id
  for update;
  select * into owner_member from private.mail_mailbox_members
  where mailbox_id = mailbox.id and user_id = p_user;

  if mailbox.status <> 'active' or mailbox.type <> 'personal' or mailbox.archived_at is not null
    or mailbox.created_by is distinct from p_user
    or mailbox.ws_id is distinct from receipt.restored_ws_id
    or owner_member.id is distinct from receipt.restored_member_id
    or owner_member.role is distinct from 'owner'
    or owner_member.created_by is distinct from p_user
    or exists (
      select 1 from private.mail_mailbox_members
      where mailbox_id = mailbox.id and user_id <> p_user
    ) then
    raise exception 'Mailbox restoration rollback refused: restored ownership state changed';
  end if;

  update private.mail_mailboxes
  set status = receipt.previous_status, created_by = receipt.previous_created_by,
    ws_id = receipt.previous_ws_id
  where id = mailbox.id;

  if p_user = any (receipt.previous_member_ids) then
    update private.mail_mailbox_members
    set role = receipt.previous_member_role, created_by = receipt.previous_member_created_by
    where id = owner_member.id;
  else
    delete from private.mail_mailbox_members where id = owner_member.id;
  end if;

  delete from private.mail_mailbox_restorations where mailbox_id = mailbox.id;
end;
$$;

-- tuturuuu: no-grant (internal)
create function private.inspect_retained_personal_mailbox(p_user uuid)
returns table (mailbox_id uuid, status text)
language sql
stable
set search_path = ''
as $$
  select mailbox.id, mailbox.status
  from auth.users account
  join private.mail_mailboxes mailbox on lower(mailbox.address) = lower(account.email)
  where account.id = p_user
    and account.email_confirmed_at is not null
    and account.deleted_at is null
    and account.is_anonymous is false
    and mailbox.type = 'personal'
    and (mailbox.created_by is null or mailbox.created_by = account.id)
    and not exists (
      select 1 from private.mail_mailbox_members member
      where member.mailbox_id = mailbox.id and member.user_id <> account.id
    );
$$;

revoke all on function private.restore_retained_personal_mailbox(uuid, uuid),
  private.rollback_retained_personal_mailbox_restoration(uuid),
  private.inspect_retained_personal_mailbox(uuid)
  from public, anon, authenticated, service_role;

