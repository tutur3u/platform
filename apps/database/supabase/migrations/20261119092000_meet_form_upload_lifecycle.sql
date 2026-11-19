-- Keep reservations immutable and give the write, submit, and sweep paths one row lock.
alter table private.form_respondent_uploads
  add column meeting_id uuid,
  add column content_sha256 text check (content_sha256 ~ '^[0-9a-f]{64}$'),
  add column write_started_at timestamptz,
  add column write_expires_at timestamptz,
  add column write_finished_at timestamptz,
  add column claimed_response_id uuid references private.form_responses(id) on delete set null,
  add column cleanup_attempts smallint not null default 0 check (cleanup_attempts between 0 and 5),
  add check (write_finished_at is null or (write_started_at is not null and write_finished_at >= write_started_at)),
  add check ((write_started_at is null and write_expires_at is null)
    or (write_started_at is not null and write_expires_at is not null
      and write_expires_at = write_started_at + interval '45 seconds'));

alter table private.form_respondent_uploads
  drop constraint form_respondent_uploads_check1,
  add constraint form_respondent_uploads_cleanup_fence check (
    cleanup_started_at is null or (
      ready_at is null and claimed_response_id is null and (
        cleanup_started_at >= expires_at or (
          write_finished_at is null and write_expires_at is not null
          and cleanup_started_at >= write_expires_at + interval '30 seconds'
        )
      )
    )
  );

-- The original index only includes unready uploads. A completed unused upload
-- expires too. A separate index finds jobs whose write deadline has expired.
create index form_respondent_uploads_unclaimed_expiry_idx
  on private.form_respondent_uploads (expires_at, id)
  where claimed_response_id is null and cleanup_attempts < 5
    and (write_started_at is null or write_finished_at is not null);

create index form_respondent_uploads_unfinished_write_idx
  on private.form_respondent_uploads (write_expires_at, id)
  where claimed_response_id is null and cleanup_attempts < 5
    and write_finished_at is null and write_expires_at is not null;

grant insert (meeting_id, content_sha256, write_started_at, write_expires_at)
  on private.form_respondent_uploads to service_role;
grant update (write_finished_at, claimed_response_id, cleanup_attempts)
  on private.form_respondent_uploads to service_role;

-- tuturuuu: no-grant (trigger)
create or replace function private.guard_form_respondent_upload()
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
    if new.cleanup_started_at is not null then
      if new.ready_at is not null then
        raise exception 'Form upload reservation expired' using errcode = '55000';
      end if;
      if old.claimed_response_id is not null or
          (old.write_started_at is not null and old.write_finished_at is null
            and (old.write_expires_at is null or
              new.cleanup_started_at < old.write_expires_at + interval '30 seconds')) then
        raise exception 'Form upload is in use' using errcode = '55000';
      end if;
      if old.cleanup_attempts < 5 and new.cleanup_attempts = 5 then
        raise warning 'Meet Forms upload cleanup reached the attempt cap';
      end if;
      return new;
    end if;
    if new.ready_at is distinct from old.ready_at and (
        old.ready_at is not null or new.ready_at >= old.expires_at
      ) then
      raise exception 'Form upload reservation expired' using errcode = '55000';
    end if;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.form_id::text || ':' || new.actor_scope, 0));
  select candidate.slot into new.session_slot
  from generate_series(1, 20) as candidate(slot)
  where not exists (
    select 1 from private.form_respondent_uploads as upload
    where upload.form_id = new.form_id and upload.actor_scope = new.actor_scope
      and upload.session_slot = candidate.slot
  )
  order by candidate.slot limit 1;
  if new.session_slot is null then
    raise exception 'Form upload session limit reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_form_respondent_upload()
  from public, anon, authenticated, service_role;

create function private.start_meet_form_upload(p_upload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
<<args>>
declare
  reservation private.form_respondent_uploads%rowtype;
  write_started timestamptz;
  publication private.form_published_versions%rowtype;
  available_slot smallint;
  question_limit integer;
  question_id uuid := (p_upload->>'question_id')::uuid;
  form_id uuid := (p_upload->>'form_id')::uuid;
  version_id uuid := (p_upload->>'version_id')::uuid;
  scope_hash text := p_upload->>'actor_scope';
  requested_mime text := p_upload->>'content_type';
  requested_size integer := (p_upload->>'size_bytes')::integer;
  digest text := p_upload->>'content_sha256';
  reservation_id uuid := (p_upload->>'id')::uuid;
  launch_id uuid := (p_upload->>'launch_id')::uuid;
  meeting_id uuid := (p_upload->>'meeting_id')::uuid;
  ws_id uuid := (p_upload->>'ws_id')::uuid;
begin
  if meeting_id is null or digest is null then return jsonb_build_object('kind', 'invalid'); end if;
  select p.* into publication from private.form_published_versions as p
    where (p.id, p.form_id, p.ws_id) = (args.version_id, args.form_id, args.ws_id);
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  perform 1 from private.forms as f
    where (f.id, f.ws_id) = (args.form_id, args.ws_id) and f.status = 'published'
      and f.access_mode = publication.definition->>'accessMode'
      and (f.open_at is null or f.open_at <= clock_timestamp())
      and (f.close_at is null or f.close_at >= clock_timestamp())
    for share;
  if not found then return jsonb_build_object('kind', 'closed'); end if;

  select coalesce((question->>'maxFiles')::integer, 1) into question_limit
  from jsonb_array_elements(publication.definition->'sections') as section,
       jsonb_array_elements(section->'questions') as question
  where question->>'id' = args.question_id::text
    and question->>'type' = 'file_upload'
    and requested_size between 1 and coalesce((question->>'maxBytes')::integer, 10485760)
    and (not (question ? 'acceptedMimeTypes') or (question->'acceptedMimeTypes') ? requested_mime);
  if question_limit is null then return jsonb_build_object('kind', 'invalid'); end if;

  perform pg_advisory_xact_lock(hashtextextended(form_id::text || ':' || scope_hash, 0));
  select r.* into reservation from private.form_respondent_uploads as r where r.id = reservation_id for update;
  if found then
    if (reservation.ws_id, reservation.form_id, reservation.version_id, reservation.launch_id, reservation.meeting_id,
        reservation.question_id, reservation.actor_scope, reservation.content_type,
        reservation.size_bytes, reservation.content_sha256) is distinct from
       (ws_id, form_id, version_id, launch_id, meeting_id, question_id, scope_hash, requested_mime, requested_size, digest)
       or reservation.cleanup_started_at is not null or reservation.claimed_response_id is not null
       or reservation.expires_at <= clock_timestamp() then
      return jsonb_build_object('kind', 'not_found');
    end if;
    return jsonb_build_object('kind', case when reservation.ready_at is null then 'pending' else 'ready' end);
  end if;

  select s.slot into available_slot from generate_series(1, least(question_limit, 5)) as s(slot)
    where not exists (
      select 1 from private.form_respondent_uploads as r
      where (r.version_id, r.launch_id, r.question_id, r.actor_scope, r.slot) =
        (args.version_id, args.launch_id, args.question_id, scope_hash, s.slot)
    ) order by s.slot limit 1;
  if available_slot is null then return jsonb_build_object('kind', 'limit'); end if;

  write_started := clock_timestamp();
  insert into private.form_respondent_uploads
    (id, ws_id, form_id, version_id, launch_id, meeting_id, question_id, actor_scope, slot, content_type, size_bytes,
      content_sha256, write_started_at, write_expires_at)
    values (reservation_id, ws_id, form_id, version_id, launch_id, meeting_id, question_id, scope_hash,
      available_slot, requested_mime, requested_size, digest, write_started, write_started + interval '45 seconds');
  return jsonb_build_object('kind', 'write');
exception when unique_violation or check_violation then
  return jsonb_build_object('kind', 'limit');
end;
$$;

revoke all on function private.start_meet_form_upload(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.start_meet_form_upload(jsonb) to service_role;

-- A definitive producer result closes the write. Timeout leaves it unfinished
-- until the cleanup claim can seal the reservation after the commit deadline.
create function private.finish_meet_form_upload(p_upload jsonb, p_stored boolean)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with tick as materialized (select clock_timestamp() as at), settled as (
    update private.form_respondent_uploads as r
      set write_finished_at = tick.at,
          ready_at = case when p_stored and r.expires_at > tick.at then tick.at end
      from tick
      where r.id = (p_upload->>'id')::uuid and r.ws_id = (p_upload->>'ws_id')::uuid
        and r.form_id = (p_upload->>'form_id')::uuid and r.version_id = (p_upload->>'version_id')::uuid
        and r.launch_id = (p_upload->>'launch_id')::uuid and r.meeting_id = (p_upload->>'meeting_id')::uuid and r.question_id = (p_upload->>'question_id')::uuid
        and r.actor_scope = p_upload->>'actor_scope' and r.content_sha256 = p_upload->>'content_sha256'
        and r.write_started_at is not null and r.write_finished_at is null
        and r.cleanup_started_at is null and r.claimed_response_id is null
      returning r.ready_at
  )
  select coalesce((select ready_at is not null from settled), false);
$$;

revoke all on function private.finish_meet_form_upload(jsonb, boolean) from public, anon, authenticated, service_role;
grant execute on function private.finish_meet_form_upload(jsonb, boolean) to service_role;

create function private.commit_meet_published_form_response(p_submission jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
<<args>>
declare
  ws_id uuid := (p_submission->>'ws_id')::uuid;
  form_id uuid := (p_submission->>'form_id')::uuid;
  response_id uuid := (p_submission->>'session_id')::uuid;
  version_id uuid := (p_submission->'metadata'->>'meetVersionId')::uuid;
  launch_id uuid := (p_submission->'metadata'->>'meetLaunchId')::uuid;
  meeting_id uuid := (p_submission->'metadata'->>'meetRoomId')::uuid;
  scope_hash text := p_submission->'metadata'->>'meetUploadActorScope';
  publication private.form_published_versions%rowtype;
  answer jsonb;
  upload_id uuid;
  upload_ids uuid[] := '{}';
  result jsonb;
begin
  if p_submission->>'share_link_id' is not null or response_id is null
      or scope_hash is null or scope_hash !~ '^[0-9a-f]{64}$' or launch_id is null or meeting_id is null
      or jsonb_typeof(p_submission->'answers') is distinct from 'array'
      or jsonb_array_length(p_submission->'answers') > 500 then
    return jsonb_build_object('kind', 'invalid');
  end if;

  -- Preserve the original writer's form-first lock order, including share submits.
  perform 1 from private.forms as f where (f.id, f.ws_id) = (args.form_id, args.ws_id) for update;
  if not found then return jsonb_build_object('kind', 'not_found'); end if;
  select p.* into publication from private.form_published_versions as p
    where (p.id, p.form_id, p.ws_id) = (args.version_id, args.form_id, args.ws_id);
  if not found then return jsonb_build_object('kind', 'not_found'); end if;

  for answer in select value from jsonb_array_elements(p_submission->'answers')
    where value->>'question_type' = 'file_upload'
  loop
    if jsonb_typeof(answer->'answer_json') is distinct from 'array'
      or jsonb_array_length(answer->'answer_json') not between 1 and 5
      or not exists (
        select 1 from jsonb_array_elements(publication.definition->'sections') as section,
          jsonb_array_elements(section->'questions') as question
        where question->>'id' = answer->>'question_id' and question->>'type' = 'file_upload'
          and jsonb_array_length(answer->'answer_json') <= coalesce((question->>'maxFiles')::integer, 1)
      ) then
      return jsonb_build_object('kind', 'invalid');
    end if;
    for upload_id in select value::uuid from jsonb_array_elements_text(answer->'answer_json')
    loop
      if upload_id is null or upload_id = any(upload_ids) then return jsonb_build_object('kind', 'invalid'); end if;
      perform 1 from private.form_respondent_uploads as r
      where (r.id, r.ws_id, r.form_id, r.version_id, r.launch_id, r.meeting_id, r.question_id, r.actor_scope) =
        (upload_id, args.ws_id, args.form_id, args.version_id, args.launch_id, args.meeting_id, (answer->>'question_id')::uuid, scope_hash)
        and r.ready_at is not null and r.write_finished_at is not null and r.cleanup_started_at is null
        and (r.claimed_response_id = response_id or (r.claimed_response_id is null and r.expires_at > clock_timestamp()))
      for update;
      if not found then return jsonb_build_object('kind', 'not_found'); end if;
      upload_ids := array_append(upload_ids, upload_id);
    end loop;
  end loop;

  result := public.commit_form_response(p_submission);
  if result->>'kind' = 'submitted' and (result->>'replayed')::boolean is false then
    update private.form_respondent_uploads as r set claimed_response_id = response_id
      where r.id = any(upload_ids);
  end if;
  return result;
end;
$$;

revoke all on function private.commit_meet_published_form_response(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.commit_meet_published_form_response(jsonb) to service_role;

drop function private.claim_expired_form_respondent_uploads(uuid, text);

create function private.claim_expired_form_respondent_uploads(
  p_form_id uuid default null,
  p_actor_scope text default null
)
returns table (id uuid, ws_id uuid, version_id uuid, launch_id uuid, question_id uuid, cleanup_attempts smallint)
language sql
security invoker
set search_path = pg_catalog, pg_temp
as $$
  with candidates as (
    select r.id from private.form_respondent_uploads as r
    where r.claimed_response_id is null and r.cleanup_attempts < 5
      and (
        ((r.write_started_at is null or r.write_finished_at is not null)
          and r.expires_at <= statement_timestamp())
        or (r.write_finished_at is null
          and r.write_expires_at <= statement_timestamp() - interval '30 seconds')
      )
      and ((p_form_id is null and p_actor_scope is null)
        or (r.form_id = p_form_id and r.actor_scope = p_actor_scope))
    order by r.cleanup_started_at nulls first, r.cleanup_attempts, r.expires_at, r.id
    limit 20 for update skip locked
  )
  update private.form_respondent_uploads as r
    set cleanup_started_at = coalesce(r.cleanup_started_at, statement_timestamp()),
      ready_at = null, cleanup_attempts = r.cleanup_attempts + 1
    from candidates where r.id = candidates.id
    returning r.id, r.ws_id, r.version_id, r.launch_id, r.question_id, r.cleanup_attempts;
$$;

revoke all on function private.claim_expired_form_respondent_uploads(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.claim_expired_form_respondent_uploads(uuid, text) to service_role;


-- Storage may finish a remote upload after its HTTP caller times out. Serialize
-- publication of the object metadata with cleanup on the exact reservation row.
-- tuturuuu: no-grant (trigger)
create function private.fence_meet_form_storage_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  reservation private.form_respondent_uploads%rowtype;
  reservation_id text := split_part(new.name, '/', 5);
begin
  if new.bucket_id <> 'forms-respondent-uploads' then return new; end if;
  if reservation_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Form upload write is not admitted' using errcode = '55000';
  end if;
  select r.* into reservation from private.form_respondent_uploads as r
    where r.id = reservation_id::uuid for update;
  if not found or new.name is distinct from concat_ws('/', reservation.ws_id,
        reservation.version_id, reservation.launch_id, reservation.question_id, reservation.id)
      or reservation.write_expires_at is null or reservation.write_expires_at <= clock_timestamp()
      or reservation.write_finished_at is not null or reservation.cleanup_started_at is not null then
    raise exception 'Form upload write is not admitted' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.fence_meet_form_storage_write()
  from public, anon, authenticated, service_role, supabase_storage_admin;

create trigger fence_meet_form_storage_write
  before insert or update on storage.objects
  for each row when (new.bucket_id = 'forms-respondent-uploads')
  execute function private.fence_meet_form_storage_write();
