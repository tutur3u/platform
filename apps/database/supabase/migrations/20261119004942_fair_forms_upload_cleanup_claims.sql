-- Give expired reservations their first attempt before retrying claimed rows.
create or replace function private.claim_expired_form_respondent_uploads(
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
    order by upload.cleanup_started_at nulls first, upload.expires_at, upload.id
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
