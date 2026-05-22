create table if not exists public.topic_announcement_attachments (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  announcement_id uuid not null references public.topic_announcements(id) on update cascade on delete cascade,
  storage_path text not null,
  storage_provider text not null default 'supabase',
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamp with time zone not null default now(),
  constraint topic_announcement_attachments_storage_path_not_blank check (length(btrim(storage_path)) > 0),
  constraint topic_announcement_attachments_file_name_not_blank check (length(btrim(file_name)) > 0),
  constraint topic_announcement_attachments_storage_provider_check check (
    storage_provider in ('supabase', 'r2')
  ),
  constraint topic_announcement_attachments_content_type_check check (
    content_type in (
      'application/pdf',
      'image/gif',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  ),
  constraint topic_announcement_attachments_size_check check (
    size_bytes > 0 and size_bytes <= 10485760
  ),
  constraint topic_announcement_attachments_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint topic_announcement_attachments_relative_storage_path check (
    storage_path !~ '^/' and storage_path !~ '(^|/)\.\.(/|$)'
  )
);

create index if not exists topic_announcement_attachments_announcement_idx
  on public.topic_announcement_attachments (announcement_id, created_at, id);

create index if not exists topic_announcement_attachments_ws_created_idx
  on public.topic_announcement_attachments (ws_id, created_at desc);

create unique index if not exists topic_announcement_attachments_announcement_path_unique
  on public.topic_announcement_attachments (announcement_id, storage_path);

create or replace function public.enforce_topic_announcement_attachment_scope()
returns trigger
language plpgsql
as $$
declare
  attachment_count integer;
  attachment_total bigint;
begin
  new.storage_path := btrim(new.storage_path);
  new.file_name := btrim(new.file_name);
  new.content_type := lower(btrim(new.content_type));
  new.storage_provider := lower(btrim(new.storage_provider));

  if not exists (
    select 1
    from public.topic_announcements announcement
    where announcement.id = new.announcement_id
      and announcement.ws_id = new.ws_id
  ) then
    raise exception 'announcement_id does not belong to ws_id';
  end if;

  select count(*)::integer, coalesce(sum(size_bytes), 0)::bigint
    into attachment_count, attachment_total
  from public.topic_announcement_attachments attachment
  where attachment.announcement_id = new.announcement_id
    and attachment.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if attachment_count >= 5 then
    raise exception 'topic announcement attachments cannot exceed 5 files';
  end if;

  if attachment_total + new.size_bytes > 10485760 then
    raise exception 'topic announcement attachments cannot exceed 10 MB total';
  end if;

  return new;
end;
$$;

drop trigger if exists topic_announcement_attachments_scope_guard
  on public.topic_announcement_attachments;

create trigger topic_announcement_attachments_scope_guard
  before insert or update on public.topic_announcement_attachments
  for each row
  execute function public.enforce_topic_announcement_attachment_scope();

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
    join public.workspace_members workspace_member
      on workspace_member.ws_id = contact.ws_id
      and workspace_member.user_id = linked_user.platform_user_id
    join auth.users auth_user
      on auth_user.id = linked_user.platform_user_id
    where contact.id = p_contact_id
      and contact.workspace_user_id is not null
      and lower(auth_user.email) = lower(contact.email)
      and auth_user.email_confirmed_at is not null
  );
$$;

alter table public.topic_announcement_attachments enable row level security;

revoke all privileges on table public.topic_announcement_attachments
from public, anon, authenticated;

revoke execute on function public.topic_announcement_contact_has_linked_verified_email(uuid)
from public, anon, authenticated;

drop policy if exists "Allow service role to manage topic announcement attachments"
  on public.topic_announcement_attachments;

create policy "Allow service role to manage topic announcement attachments"
  on public.topic_announcement_attachments
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

grant all privileges on table public.topic_announcement_attachments to service_role;
grant execute on function public.topic_announcement_contact_has_linked_verified_email(uuid)
to service_role;
