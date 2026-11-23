-- The public Forms share route commits through public.commit_form_response.
-- These calls use the route's exact payload shape as service_role and cover
-- the response limit, replay and conflict paths of the share-link branch.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('7e000000-0000-4000-8000-000000000001', 'forms-share-owner@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, personal, creator_id) values
  ('7e000000-0000-4000-8000-0000000000a1', 'Forms share', false, '7e000000-0000-4000-8000-000000000001');
insert into private.forms (id, ws_id, creator_id, title, status, access_mode, max_responses, settings) values
  ('7e000000-0000-4000-8000-0000000000f1', '7e000000-0000-4000-8000-0000000000a1',
   '7e000000-0000-4000-8000-000000000001', 'Survey', 'published', 'anonymous', 1, '{"requireTurnstile": true}');
insert into private.form_sections (id, form_id, title) values
  ('7e000000-0000-4000-8000-0000000000e1', '7e000000-0000-4000-8000-0000000000f1', 'One');
insert into private.form_questions (id, form_id, section_id, type, title) values
  ('7e000000-0000-4000-8000-0000000000d1', '7e000000-0000-4000-8000-0000000000f1',
   '7e000000-0000-4000-8000-0000000000e1', 'short_text', 'Name');
insert into private.form_share_links (id, form_id, code, active, created_by_user_id) values
  ('7e000000-0000-4000-8000-0000000000c1', '7e000000-0000-4000-8000-0000000000f1', 'share-commit', true, '7e000000-0000-4000-8000-000000000001');
insert into private.form_sessions (id, form_id, share_link_id, session_token) values
  ('7e000000-0000-4000-8000-000000000101', '7e000000-0000-4000-8000-0000000000f1', '7e000000-0000-4000-8000-0000000000c1', 'one'),
  ('7e000000-0000-4000-8000-000000000102', '7e000000-0000-4000-8000-0000000000f1', '7e000000-0000-4000-8000-0000000000c1', 'two');

create function pg_temp.commit(
  p_session text, p_commitment text default repeat('a', 64), p_revision text default null
)
returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  r := public.commit_form_response(jsonb_build_object(
    'ws_id', '7e000000-0000-4000-8000-0000000000a1',
    'form_id', '7e000000-0000-4000-8000-0000000000f1',
    'share_link_id', '7e000000-0000-4000-8000-0000000000c1',
    'session_id', p_session,
    'commitment', p_commitment,
    'policy_revision', coalesce(p_revision, (select to_jsonb(updated_at)->>0
      from private.forms where id = '7e000000-0000-4000-8000-0000000000f1')),
    'proof', 'verified',
    'access_mode', 'anonymous',
    'respondent_user_id', null,
    'respondent_email', null,
    'snapshot_open_at', null,
    'snapshot_close_at', null,
    'snapshot_max_responses', 1,
    'last_section_id', '7e000000-0000-4000-8000-0000000000e1',
    'metadata', '{}'::jsonb,
    'answers', jsonb_build_array(jsonb_build_object(
      'question_id', '7e000000-0000-4000-8000-0000000000d1', 'question_title', 'Name',
      'question_type', 'short_text', 'answer_text', 'Ada', 'answer_json', null))));
  execute 'reset role';
  return r;
end $$;

create temp table first_commit on commit drop as
  select pg_temp.commit('7e000000-0000-4000-8000-000000000101') as reply;
select is((select reply->>'kind' from first_commit), 'submitted', 'the first share response commits');
select is((select reply->>'replayed' from first_commit), 'false', 'it is not a replay');
select is((select count(*) from private.form_response_answers a join private.form_responses r on r.id = a.response_id
  where r.form_id = '7e000000-0000-4000-8000-0000000000f1')::integer, 1, 'answers commit with the response');
select ok((select submitted_at is not null and last_section_id = '7e000000-0000-4000-8000-0000000000e1'
  from private.form_sessions where id = '7e000000-0000-4000-8000-000000000101'), 'the session closes in the same transaction');

select is(pg_temp.commit('7e000000-0000-4000-8000-000000000102')->>'kind', 'limit', 'a second session hits the response limit');
select is((select count(*) from private.form_responses where form_id = '7e000000-0000-4000-8000-0000000000f1')::integer, 1, 'the limit stores nothing');

select is(pg_temp.commit('7e000000-0000-4000-8000-000000000101')->>'replayed', 'true', 'the same submission replays');
select is(pg_temp.commit('7e000000-0000-4000-8000-000000000101', repeat('b', 64))->>'kind', 'conflict', 'other answers on a submitted session conflict');

select is(pg_temp.commit('7e000000-0000-4000-8000-000000000102', p_revision => '2000-01-01T00:00:00+00:00')->>'kind',
  'policy_changed', 'a form edited since the route read it is refused');

select * from finish();
rollback;
