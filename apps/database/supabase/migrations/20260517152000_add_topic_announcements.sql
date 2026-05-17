create table if not exists public.topic_announcement_contacts (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  workspace_user_id uuid references public.workspace_users(id) on update cascade on delete set null,
  name text not null,
  email text not null,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_by uuid references public.users(id) on update cascade on delete set null,
  updated_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint topic_announcement_contacts_email_not_blank check (length(btrim(email)) > 0),
  constraint topic_announcement_contacts_name_not_blank check (length(btrim(name)) > 0),
  constraint topic_announcement_contacts_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists topic_announcement_contacts_ws_email_unique
  on public.topic_announcement_contacts (ws_id, lower(email))
  where archived = false;

create index if not exists topic_announcement_contacts_ws_name_idx
  on public.topic_announcement_contacts (ws_id, lower(name));

create index if not exists topic_announcement_contacts_ws_workspace_user_idx
  on public.topic_announcement_contacts (ws_id, workspace_user_id)
  where workspace_user_id is not null;

create table if not exists public.topic_announcement_contact_verifications (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  contact_id uuid not null references public.topic_announcement_contacts(id) on update cascade on delete cascade,
  email text not null,
  token_hash text not null,
  status text not null default 'pending',
  requested_by uuid references public.users(id) on update cascade on delete set null,
  verified_at timestamp with time zone,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint topic_announcement_contact_verifications_email_not_blank check (length(btrim(email)) > 0),
  constraint topic_announcement_contact_verifications_status_check check (
    status in ('pending', 'verified', 'expired', 'revoked')
  )
);

create unique index if not exists topic_announcement_contact_verifications_token_hash_unique
  on public.topic_announcement_contact_verifications (token_hash);

create index if not exists topic_announcement_contact_verifications_contact_status_idx
  on public.topic_announcement_contact_verifications (contact_id, status, expires_at desc);

create index if not exists topic_announcement_contact_verifications_ws_email_idx
  on public.topic_announcement_contact_verifications (ws_id, lower(email), status);

create table if not exists public.topic_announcement_batches (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  source_type text not null default 'manual',
  source_name text,
  row_count integer not null default 0 check (row_count >= 0),
  created_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamp with time zone not null default now()
);

create index if not exists topic_announcement_batches_ws_created_idx
  on public.topic_announcement_batches (ws_id, created_at desc);

create table if not exists public.topic_announcements (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  batch_id uuid references public.topic_announcement_batches(id) on update cascade on delete set null,
  group_id uuid references public.workspace_user_groups(id) on update cascade on delete set null,
  title text not null,
  topic text not null,
  body text not null default '',
  class_label text,
  day_label text,
  session_date date,
  start_time time,
  room text,
  place text,
  source_type text not null default 'manual',
  source_row_number integer,
  status text not null default 'draft',
  last_error text,
  sent_at timestamp with time zone,
  sent_email_audit_id uuid references public.email_audit(id) on update cascade on delete set null,
  created_by uuid references public.users(id) on update cascade on delete set null,
  updated_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint topic_announcements_title_not_blank check (length(btrim(title)) > 0),
  constraint topic_announcements_topic_not_blank check (length(btrim(topic)) > 0),
  constraint topic_announcements_source_row_number_positive check (
    source_row_number is null or source_row_number > 0
  ),
  constraint topic_announcements_status_check check (
    status in ('draft', 'queued', 'sent', 'failed', 'skipped', 'cancelled')
  )
);

create index if not exists topic_announcements_ws_created_idx
  on public.topic_announcements (ws_id, created_at desc);

create index if not exists topic_announcements_ws_status_created_idx
  on public.topic_announcements (ws_id, status, created_at desc);

create index if not exists topic_announcements_ws_schedule_idx
  on public.topic_announcements (ws_id, session_date, start_time)
  where session_date is not null;

create index if not exists topic_announcements_batch_idx
  on public.topic_announcements (batch_id)
  where batch_id is not null;

create table if not exists public.topic_announcement_recipients (
  announcement_id uuid not null references public.topic_announcements(id) on update cascade on delete cascade,
  contact_id uuid not null references public.topic_announcement_contacts(id) on update cascade on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (announcement_id, contact_id)
);

create index if not exists topic_announcement_recipients_contact_idx
  on public.topic_announcement_recipients (contact_id, created_at desc);

drop trigger if exists topic_announcement_contacts_updated_at
  on public.topic_announcement_contacts;

create trigger topic_announcement_contacts_updated_at
  before update on public.topic_announcement_contacts
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists topic_announcement_contact_verifications_updated_at
  on public.topic_announcement_contact_verifications;

create trigger topic_announcement_contact_verifications_updated_at
  before update on public.topic_announcement_contact_verifications
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists topic_announcements_updated_at
  on public.topic_announcements;

create trigger topic_announcements_updated_at
  before update on public.topic_announcements
  for each row
  execute function public.update_updated_at_column();

create or replace function public.enforce_topic_announcement_contact_scope()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  new.name := btrim(new.name);

  if new.workspace_user_id is not null and not exists (
    select 1
    from public.workspace_users workspace_user
    where workspace_user.id = new.workspace_user_id
      and workspace_user.ws_id = new.ws_id
  ) then
    raise exception 'workspace_user_id does not belong to ws_id';
  end if;

  return new;
end;
$$;

drop trigger if exists topic_announcement_contacts_scope_guard
  on public.topic_announcement_contacts;

create trigger topic_announcement_contacts_scope_guard
  before insert or update on public.topic_announcement_contacts
  for each row
  execute function public.enforce_topic_announcement_contact_scope();

create or replace function public.enforce_topic_announcement_verification_scope()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));

  if not exists (
    select 1
    from public.topic_announcement_contacts contact
    where contact.id = new.contact_id
      and contact.ws_id = new.ws_id
      and lower(contact.email) = new.email
  ) then
    raise exception 'contact_id/email does not belong to ws_id';
  end if;

  if new.status = 'verified' and new.verified_at is null then
    new.verified_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists topic_announcement_contact_verifications_scope_guard
  on public.topic_announcement_contact_verifications;

create trigger topic_announcement_contact_verifications_scope_guard
  before insert or update on public.topic_announcement_contact_verifications
  for each row
  execute function public.enforce_topic_announcement_verification_scope();

create or replace function public.enforce_topic_announcement_scope()
returns trigger
language plpgsql
as $$
begin
  new.title := btrim(new.title);
  new.topic := btrim(new.topic);

  if new.batch_id is not null and not exists (
    select 1
    from public.topic_announcement_batches batch
    where batch.id = new.batch_id
      and batch.ws_id = new.ws_id
  ) then
    raise exception 'batch_id does not belong to ws_id';
  end if;

  if new.group_id is not null and not exists (
    select 1
    from public.workspace_user_groups user_group
    where user_group.id = new.group_id
      and user_group.ws_id = new.ws_id
  ) then
    raise exception 'group_id does not belong to ws_id';
  end if;

  return new;
end;
$$;

drop trigger if exists topic_announcements_scope_guard
  on public.topic_announcements;

create trigger topic_announcements_scope_guard
  before insert or update on public.topic_announcements
  for each row
  execute function public.enforce_topic_announcement_scope();

create or replace function public.enforce_topic_announcement_recipient_scope()
returns trigger
language plpgsql
as $$
declare
  announcement_ws_id uuid;
begin
  select announcement.ws_id
    into announcement_ws_id
  from public.topic_announcements announcement
  where announcement.id = new.announcement_id;

  if announcement_ws_id is null then
    raise exception 'announcement_id does not exist';
  end if;

  if not exists (
    select 1
    from public.topic_announcement_contacts contact
    where contact.id = new.contact_id
      and contact.ws_id = announcement_ws_id
      and contact.archived = false
  ) then
    raise exception 'contact_id does not belong to announcement ws_id';
  end if;

  return new;
end;
$$;

drop trigger if exists topic_announcement_recipients_scope_guard
  on public.topic_announcement_recipients;

create trigger topic_announcement_recipients_scope_guard
  before insert or update on public.topic_announcement_recipients
  for each row
  execute function public.enforce_topic_announcement_recipient_scope();

create or replace function public.topic_announcement_contact_has_linked_verified_email(
  p_contact_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.topic_announcement_contacts contact
    join public.workspace_user_linked_users linked_user
      on linked_user.virtual_user_id = contact.workspace_user_id
      and linked_user.ws_id = contact.ws_id
    join auth.users auth_user
      on auth_user.id = linked_user.platform_user_id
    where contact.id = p_contact_id
      and contact.workspace_user_id is not null
      and lower(auth_user.email) = lower(contact.email)
      and auth_user.email_confirmed_at is not null
  );
$$;

alter table public.topic_announcement_contacts enable row level security;
alter table public.topic_announcement_contact_verifications enable row level security;
alter table public.topic_announcement_batches enable row level security;
alter table public.topic_announcements enable row level security;
alter table public.topic_announcement_recipients enable row level security;

drop policy if exists "Allow workspace members to view topic announcement contacts"
  on public.topic_announcement_contacts;

create policy "Allow workspace members to view topic announcement contacts"
  on public.topic_announcement_contacts
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = topic_announcement_contacts.ws_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Allow workspace members to manage topic announcement contacts"
  on public.topic_announcement_contacts;

create policy "Allow workspace members to manage topic announcement contacts"
  on public.topic_announcement_contacts
  as permissive
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = topic_announcement_contacts.ws_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = topic_announcement_contacts.ws_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Allow workspace members to view topic announcement batches"
  on public.topic_announcement_batches;

create policy "Allow workspace members to view topic announcement batches"
  on public.topic_announcement_batches
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = topic_announcement_batches.ws_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Allow workspace members to manage topic announcement batches"
  on public.topic_announcement_batches;

create policy "Allow workspace members to manage topic announcement batches"
  on public.topic_announcement_batches
  as permissive
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = topic_announcement_batches.ws_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = topic_announcement_batches.ws_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Allow workspace members to view topic announcements"
  on public.topic_announcements;

create policy "Allow workspace members to view topic announcements"
  on public.topic_announcements
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = topic_announcements.ws_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Allow workspace members to manage topic announcements"
  on public.topic_announcements;

create policy "Allow workspace members to manage topic announcements"
  on public.topic_announcements
  as permissive
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = topic_announcements.ws_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = topic_announcements.ws_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Allow workspace members to view topic announcement recipients"
  on public.topic_announcement_recipients;

create policy "Allow workspace members to view topic announcement recipients"
  on public.topic_announcement_recipients
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.topic_announcements announcement
      join public.workspace_members wm
        on wm.ws_id = announcement.ws_id
      where announcement.id = topic_announcement_recipients.announcement_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Allow workspace members to manage topic announcement recipients"
  on public.topic_announcement_recipients;

create policy "Allow workspace members to manage topic announcement recipients"
  on public.topic_announcement_recipients
  as permissive
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.topic_announcements announcement
      join public.workspace_members wm
        on wm.ws_id = announcement.ws_id
      where announcement.id = topic_announcement_recipients.announcement_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.topic_announcements announcement
      join public.workspace_members wm
        on wm.ws_id = announcement.ws_id
      where announcement.id = topic_announcement_recipients.announcement_id
        and wm.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.topic_announcement_contacts to authenticated;
grant select, insert, update, delete on public.topic_announcement_batches to authenticated;
grant select, insert, update, delete on public.topic_announcements to authenticated;
grant select, insert, update, delete on public.topic_announcement_recipients to authenticated;
grant all on public.topic_announcement_contacts to service_role;
grant all on public.topic_announcement_contact_verifications to service_role;
grant all on public.topic_announcement_batches to service_role;
grant all on public.topic_announcements to service_role;
grant all on public.topic_announcement_recipients to service_role;
grant execute on function public.topic_announcement_contact_has_linked_verified_email(uuid) to authenticated;
grant execute on function public.topic_announcement_contact_has_linked_verified_email(uuid) to service_role;
