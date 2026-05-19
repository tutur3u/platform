-- Topic announcement templates and scheduled send support

create table if not exists public.topic_announcement_templates (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  name text not null,
  title text not null,
  topic text not null default '',
  class_label text,
  day_label text,
  session_date date,
  start_time time,
  room text,
  place text,
  group_id uuid references public.workspace_user_groups(id) on update cascade on delete set null,
  default_contact_ids uuid[] not null default '{}',
  created_by uuid references public.users(id) on update cascade on delete set null,
  updated_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint topic_announcement_templates_name_not_blank check (length(btrim(name)) > 0),
  constraint topic_announcement_templates_title_not_blank check (length(btrim(title)) > 0),
  constraint topic_announcement_templates_default_contact_ids_max check (
    coalesce(array_length(default_contact_ids, 1), 0) <= 50
  )
);

create unique index if not exists topic_announcement_templates_ws_name_unique
  on public.topic_announcement_templates (ws_id, lower(name));

create index if not exists topic_announcement_templates_ws_created_idx
  on public.topic_announcement_templates (ws_id, created_at desc);

drop trigger if exists topic_announcement_templates_updated_at
  on public.topic_announcement_templates;

create trigger topic_announcement_templates_updated_at
  before update on public.topic_announcement_templates
  for each row
  execute function public.update_updated_at_column();

alter table public.topic_announcements
  add column if not exists scheduled_send_at timestamp with time zone;

create index if not exists topic_announcements_ws_queued_send_idx
  on public.topic_announcements (ws_id, scheduled_send_at)
  where status = 'queued' and scheduled_send_at is not null;

alter table public.topic_announcement_templates enable row level security;

revoke all privileges on table public.topic_announcement_templates
from public, anon, authenticated;

drop policy if exists "Allow service role to manage topic announcement templates"
  on public.topic_announcement_templates;

create policy "Allow service role to manage topic announcement templates"
  on public.topic_announcement_templates
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

grant all privileges on table public.topic_announcement_templates to service_role;
