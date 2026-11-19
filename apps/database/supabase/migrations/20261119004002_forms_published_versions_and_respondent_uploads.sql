-- Forms moved to private in 20260531210558_move_forms_private.sql.
alter table private.form_questions
  drop constraint form_questions_type_check,
  add constraint form_questions_type_check check (type in (
    'short_text', 'long_text', 'email', 'phone', 'number', 'url',
    'single_choice', 'multiple_choice', 'dropdown', 'ranking', 'linear_scale',
    'rating', 'nps', 'date', 'time', 'section_break', 'rich_text', 'image',
    'youtube', 'divider', 'matrix', 'file_upload'
  ));

alter table private.forms
  add constraint forms_id_ws_id_key unique (id, ws_id);

create table private.form_published_versions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null,
  ws_id uuid not null,
  definition jsonb not null,
  quiz_keys jsonb not null default '{}'::jsonb,
  score_reveal text not null default 'never',
  answer_reveal text not null default 'never',
  published_at timestamptz not null default statement_timestamp(),
  unique (id, form_id, ws_id),
  foreign key (form_id, ws_id) references private.forms (id, ws_id) on delete cascade,
  check (
    jsonb_typeof(definition) = 'object'
    and (definition ->> 'id' = form_id::text) is true
    and (definition ->> 'wsId' = ws_id::text) is true
    and (jsonb_typeof(definition -> 'sections') = 'array') is true
    and not (definition ?| array['shareCode', 'creatorId', 'seo', 'quizKeys'])
  ),
  check (jsonb_typeof(quiz_keys) = 'object'),
  check (score_reveal in ('never', 'after_submit', 'manual')),
  check (answer_reveal in ('never', 'after_submit', 'manual'))
);

create index form_published_versions_form_idx
  on private.form_published_versions (form_id, ws_id, published_at desc);

create table private.form_respondent_uploads (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null,
  form_id uuid not null,
  version_id uuid not null,
  launch_id uuid not null,
  question_id uuid not null,
  actor_scope text not null check (actor_scope ~ '^[0-9a-f]{64}$'),
  slot smallint not null check (slot between 1 and 5),
  session_slot smallint not null default 1 check (session_slot between 1 and 20),
  content_type text not null check (content_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
  )),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  ready_at timestamptz,
  cleanup_started_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default (statement_timestamp() + interval '15 minutes'),
  check (expires_at > created_at),
  check (cleanup_started_at is null or (ready_at is null and cleanup_started_at >= expires_at)),
  unique (form_id, actor_scope, session_slot),
  foreign key (version_id, form_id, ws_id)
    references private.form_published_versions (id, form_id, ws_id) on delete cascade,
  unique (version_id, launch_id, question_id, actor_scope, slot)
);

create index form_respondent_uploads_expiry_idx
  on private.form_respondent_uploads (expires_at, id) where ready_at is null;

alter table private.form_published_versions enable row level security;
alter table private.form_published_versions force row level security;
alter table private.form_respondent_uploads enable row level security;
alter table private.form_respondent_uploads force row level security;

revoke all on private.form_published_versions, private.form_respondent_uploads
  from public, anon, authenticated, service_role;
grant select, insert on private.form_published_versions to service_role;
grant select, delete on private.form_respondent_uploads to service_role;
grant insert (id, ws_id, form_id, version_id, launch_id, question_id,
  actor_scope, slot, content_type, size_bytes)
  on private.form_respondent_uploads to service_role;
grant update (ready_at, cleanup_started_at) on private.form_respondent_uploads to service_role;

-- Serialize all reservations for a form and server-derived respondent session.
-- The slot constraint also fences races under stronger transaction isolation.
-- tuturuuu: no-grant (trigger)
create function private.guard_form_respondent_upload()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if old.cleanup_started_at is not null and new.cleanup_started_at is distinct from old.cleanup_started_at then
      raise exception 'Form upload cleanup has started' using errcode = '55000';
    end if;
    if new.ready_at is distinct from old.ready_at
      and (old.cleanup_started_at is not null or old.expires_at <= clock_timestamp()) then
      raise exception 'Form upload reservation expired' using errcode = '55000';
    end if;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.form_id::text || ':' || new.actor_scope, 0));

  select candidate.slot into new.session_slot
  from generate_series(1, 20) as candidate(slot)
  where not exists (
    select 1
    from private.form_respondent_uploads as upload
    where upload.form_id = new.form_id
      and upload.actor_scope = new.actor_scope
      and upload.session_slot = candidate.slot
  )
  order by candidate.slot
  limit 1;

  if new.session_slot is null then
    raise exception 'Form upload session limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_form_respondent_upload()
  from public, anon, authenticated, service_role;

create trigger guard_form_respondent_upload
  before insert or update of ready_at, cleanup_started_at on private.form_respondent_uploads
  for each row execute function private.guard_form_respondent_upload();

-- Claim before Storage removal so a concurrent completion cannot publish the object.
-- Repeated claims return the same unready rows until Storage removal is confirmed.
create function private.claim_expired_form_respondent_uploads(
  p_form_id uuid default null,
  p_actor_scope text default null
)
returns table (id uuid, ws_id uuid, version_id uuid, launch_id uuid, question_id uuid)
language sql
security invoker
set search_path = pg_catalog, pg_temp
as $$
  with candidates as (
    select upload.id
    from private.form_respondent_uploads as upload
    where upload.ready_at is null
      and upload.expires_at <= statement_timestamp()
      and (
        (p_form_id is null and p_actor_scope is null)
        or (upload.form_id = p_form_id and upload.actor_scope = p_actor_scope)
      )
    order by upload.expires_at, upload.id
    limit 20
    for update skip locked
  )
  update private.form_respondent_uploads as upload
  set cleanup_started_at = coalesce(upload.cleanup_started_at, statement_timestamp())
  from candidates
  where upload.id = candidates.id
  returning upload.id, upload.ws_id, upload.version_id, upload.launch_id, upload.question_id;
$$;

revoke all on function private.claim_expired_form_respondent_uploads(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.claim_expired_form_respondent_uploads(uuid, text)
  to service_role;

-- Keep publication append-only, including on connections that own the table.
-- tuturuuu: no-grant (trigger)
create function private.reject_form_version_update()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'Published form versions are immutable' using errcode = '55000';
end;
$$;

revoke all on function private.reject_form_version_update()
  from public, anon, authenticated, service_role;

create trigger reject_form_version_update
  before update on private.form_published_versions
  for each row execute function private.reject_form_version_update();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'forms-respondent-uploads', 'forms-respondent-uploads', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
) on conflict (id) do nothing;

-- Restrictive policy also fences future permissive client storage policies.
-- The trusted Forms server locates objects only via scoped upload records.
create policy forms_respondent_uploads_client_fence
  on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'forms-respondent-uploads')
  with check (bucket_id <> 'forms-respondent-uploads');
