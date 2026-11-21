-- Meeting short links on ttr.gg reuse public.shortened_links.
--
-- A meeting link row carries meet_meeting_id, so deleting the meeting deletes
-- the link. Rows are written only by the service-role Meet API; restrictive
-- policies stop clients from creating, editing or removing them. The guard
-- trigger enforces the namespace rules in the database as well as the API:
--   * meet/<7 base62 chars> generated codes are open to every eligible host;
--   * root-level codes and vanity slugs need a verified Tuturuuu staff creator;
--   * the meet/ prefix belongs to meeting links only;
--   * the destination is exactly the canonical tuturuuu.com/meet join URL;
--   * meeting links carry no password and at most 5 vanity slugs each.
begin;

alter table public.shortened_links
  add column expires_at timestamptz,
  add column meet_meeting_id uuid references public.workspace_meetings (id) on delete cascade,
  add column meet_link_kind text;

alter table public.shortened_links
  add constraint shortened_links_meet_link_kind_check
    check (meet_link_kind is null or meet_link_kind in ('generated', 'vanity')),
  add constraint shortened_links_meet_link_shape_check
    check ((meet_meeting_id is null) = (meet_link_kind is null)),
  add constraint shortened_links_meet_link_target_check
    check (
      meet_meeting_id is null
      or (
        link = 'https://tuturuuu.com/meet/' || ws_id::text || '/meetings/' || meet_meeting_id::text
        and expires_at is not null
      )
    );

alter table public.shortened_links
  add constraint shortened_links_meet_link_no_password_check
    check (meet_meeting_id is null or (password_hash is null and password_hint is null));

create unique index shortened_links_meet_generated_key
  on public.shortened_links (meet_meeting_id)
  where meet_link_kind = 'generated';

create index shortened_links_meet_meeting_idx
  on public.shortened_links (meet_meeting_id)
  where meet_meeting_id is not null;

create index shortened_links_meet_creator_created_idx
  on public.shortened_links (creator_id, created_at desc)
  where meet_meeting_id is not null;

-- tuturuuu: no-grant (trigger)
create or replace function private.guard_meet_short_link()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.meet_meeting_id is null then
    if new.slug like 'meet/%' then
      raise exception 'The meet/ prefix is reserved for meeting links'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if not exists (
    select 1
    from public.workspace_meetings m
    where m.id = new.meet_meeting_id
      and m.ws_id = new.ws_id
  ) then
    raise exception 'Meeting short link must match its meeting workspace'
      using errcode = '23514';
  end if;

  if new.meet_link_kind = 'generated' and new.slug ~ '^meet/[A-Za-z0-9]{7}$' then
    return new;
  end if;

  if not coalesce(public.is_verified_tuturuuu_staff(new.creator_id, false), false) then
    raise exception 'Only verified Tuturuuu staff can set root or vanity meeting links'
      using errcode = '42501';
  end if;

  if new.meet_link_kind = 'generated' and new.slug ~ '^[A-Za-z0-9]{7}$' then
    return new;
  end if;

  if new.meet_link_kind = 'vanity'
    and new.slug ~ '^(meet/)?[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
    and new.slug !~ '--' then
    if tg_op = 'INSERT' or old.meet_meeting_id is distinct from new.meet_meeting_id then
      -- Serialize vanity inserts per meeting so parallel requests cannot pass
      -- the cap together.
      perform pg_advisory_xact_lock(hashtextextended('meet_short_link:' || new.meet_meeting_id::text, 0));
      if (
        select count(*)
        from public.shortened_links l
        where l.meet_meeting_id = new.meet_meeting_id
          and l.meet_link_kind = 'vanity'
          and l.id is distinct from new.id
      ) >= 5 then
        raise exception 'A meeting can have up to 5 vanity links'
          using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  raise exception 'Invalid meeting short link slug' using errcode = '23514';
end;
$$;

revoke all on function private.guard_meet_short_link() from public, anon, authenticated, service_role;

create trigger guard_meet_short_link
  before insert or update of slug, link, ws_id, creator_id, meet_meeting_id, meet_link_kind
  on public.shortened_links
  for each row
  execute function private.guard_meet_short_link();

create policy "Meeting short links are created by the Meet service"
  on public.shortened_links
  as restrictive
  for insert
  to anon, authenticated
  with check (meet_meeting_id is null and meet_link_kind is null);

create policy "Meeting short links are changed by the Meet service"
  on public.shortened_links
  as restrictive
  for update
  to anon, authenticated
  using (meet_meeting_id is null)
  with check (meet_meeting_id is null and meet_link_kind is null);

create policy "Meeting short links are removed by the Meet service"
  on public.shortened_links
  as restrictive
  for delete
  to anon, authenticated
  using (meet_meeting_id is null);

create table private.meet_short_link_audit (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  -- No foreign key: the history outlives the meeting it describes.
  meeting_id uuid not null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('create', 'update', 'delete')),
  link_kind text not null check (link_kind in ('generated', 'vanity')),
  slug text not null check (char_length(slug) between 1 and 64),
  previous_slug text check (previous_slug is null or char_length(previous_slug) between 1 and 64),
  created_at timestamptz not null default now()
);

create index meet_short_link_audit_actor_created_idx
  on private.meet_short_link_audit (actor_id, created_at desc);

create index meet_short_link_audit_meeting_created_idx
  on private.meet_short_link_audit (meeting_id, created_at desc);

alter table private.meet_short_link_audit enable row level security;

revoke all on table private.meet_short_link_audit from public, anon, authenticated;
grant select, insert on table private.meet_short_link_audit to service_role;

commit;
