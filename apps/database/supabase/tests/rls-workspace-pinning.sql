begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(33);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, created_at, updated_at
)
values
  ('00000000-0000-4000-8000-00000000c101', 'authenticated', 'authenticated', 'rls-owner@example.com', now(), now(), now()),
  ('00000000-0000-4000-8000-00000000c102', 'authenticated', 'authenticated', 'rls-invitee@example.com', now(), now(), now()),
  ('00000000-0000-4000-8000-00000000c103', 'authenticated', 'authenticated', 'rls-victim@example.com', now(), now(), now())
on conflict (id) do nothing;

insert into public.users (id, display_name)
values
  ('00000000-0000-4000-8000-00000000c101', 'RLS Owner'),
  ('00000000-0000-4000-8000-00000000c102', 'RLS Invitee'),
  ('00000000-0000-4000-8000-00000000c103', 'RLS Victim')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  ('00000000-0000-4000-8000-00000000c201', 'RLS Owner Workspace', '00000000-0000-4000-8000-00000000c101', false),
  ('00000000-0000-4000-8000-00000000c202', 'RLS Invited Workspace', '00000000-0000-4000-8000-00000000c103', false)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values ('00000000-0000-4000-8000-00000000c201', '00000000-0000-4000-8000-00000000c101', 'MEMBER')
on conflict (ws_id, user_id) do nothing;

insert into public.workspace_email_invites (ws_id, email)
values ('00000000-0000-4000-8000-00000000c202', 'rls-invitee@example.com')
on conflict (ws_id, email) do nothing;

set local role service_role;
select set_config('request.jwt.claims', '', true);

insert into public.notes (id, ws_id, creator_id, title, content)
values ('00000000-0000-4000-8000-00000000c301', '00000000-0000-4000-8000-00000000c201', '00000000-0000-4000-8000-00000000c101', 'Owner note', '{"type":"doc","content":[]}');

insert into public.live_api_sessions (user_id, ws_id, session_handle, expires_at, scope_key)
values ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c201', 'existing-session-handle', now() + interval '1 hour', 'legacy:default');

insert into public.calendar_auth_tokens (id, user_id, ws_id, access_token, refresh_token)
values ('00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c201', 'access', 'refresh');
insert into public.calendar_auth_tokens (id, user_id, ws_id, access_token, refresh_token)
values ('00000000-0000-4000-8000-00000000c406', '00000000-0000-4000-8000-00000000c103', '00000000-0000-4000-8000-00000000c201', 'victim-access', 'victim-refresh');

insert into public.aurora_ml_forecast (id, ws_id, date, elasticnet, lightgbm, xgboost, catboost)
values ('00000000-0000-4000-8000-00000000c501', '00000000-0000-4000-8000-00000000c202', current_date, 1, 2, 3, 4);
insert into public.aurora_ml_metrics (id, ws_id, model, rmse, directional_accuracy, turning_point_accuracy, weighted_score)
values ('00000000-0000-4000-8000-00000000c502', '00000000-0000-4000-8000-00000000c202', 'test', 1, 1, 1, 1);
insert into public.aurora_statistical_forecast (
  id, ws_id, date, auto_arima, auto_arima_lo_90, auto_arima_hi_90, auto_ets, auto_ets_lo_90, auto_ets_hi_90,
  auto_theta, auto_theta_lo_90, auto_theta_hi_90, ces, ces_lo_90, ces_hi_90
) values ('00000000-0000-4000-8000-00000000c503', '00000000-0000-4000-8000-00000000c202', current_date, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
insert into public.aurora_statistical_metrics (id, ws_id, model, rmse, directional_accuracy, turning_point_accuracy, weighted_score, no_scaling)
values ('00000000-0000-4000-8000-00000000c504', '00000000-0000-4000-8000-00000000c202', 'test', 1, 1, 1, 1, false);
insert into public.workspace_roles (id, ws_id, name)
values ('00000000-0000-4000-8000-00000000c505', '00000000-0000-4000-8000-00000000c202', 'Invite-only role');


insert into public.aurora_ml_forecast (id, ws_id, date, elasticnet, lightgbm, xgboost, catboost)
values ('00000000-0000-4000-8000-00000000c511', '00000000-0000-4000-8000-00000000c201', current_date, 1, 2, 3, 4);
insert into public.aurora_ml_metrics (id, ws_id, model, rmse, directional_accuracy, turning_point_accuracy, weighted_score)
values ('00000000-0000-4000-8000-00000000c512', '00000000-0000-4000-8000-00000000c201', 'member', 1, 1, 1, 1);
insert into public.aurora_statistical_forecast (
  id, ws_id, date, auto_arima, auto_arima_lo_90, auto_arima_hi_90, auto_ets, auto_ets_lo_90, auto_ets_hi_90,
  auto_theta, auto_theta_lo_90, auto_theta_hi_90, ces, ces_lo_90, ces_hi_90
) values ('00000000-0000-4000-8000-00000000c513', '00000000-0000-4000-8000-00000000c201', current_date, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
insert into public.aurora_statistical_metrics (id, ws_id, model, rmse, directional_accuracy, turning_point_accuracy, weighted_score, no_scaling)
values ('00000000-0000-4000-8000-00000000c514', '00000000-0000-4000-8000-00000000c201', 'member', 1, 1, 1, 1, false);
insert into public.workspace_roles (id, ws_id, name)
values ('00000000-0000-4000-8000-00000000c515', '00000000-0000-4000-8000-00000000c201', 'Member role');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c101","email":"rls-owner@example.com","role":"authenticated"}', true);


select is((select count(*)::integer from public.aurora_ml_forecast where ws_id = '00000000-0000-4000-8000-00000000c201'), 1, 'SR-351: workspace member can read ML forecasts');
select is((select count(*)::integer from public.aurora_ml_metrics where ws_id = '00000000-0000-4000-8000-00000000c201'), 1, 'SR-351: workspace member can read ML metrics');
select is((select count(*)::integer from public.aurora_statistical_forecast where ws_id = '00000000-0000-4000-8000-00000000c201'), 1, 'SR-351: workspace member can read statistical forecasts');
select is((select count(*)::integer from public.aurora_statistical_metrics where ws_id = '00000000-0000-4000-8000-00000000c201'), 1, 'SR-351: workspace member can read statistical metrics');
select is((select count(*)::integer from public.workspace_roles where ws_id = '00000000-0000-4000-8000-00000000c201'), 1, 'SR-351: workspace member can list role names');


select lives_ok(
  $$insert into public.aurora_ml_forecast (ws_id, date, elasticnet, lightgbm, xgboost, catboost) values ('00000000-0000-4000-8000-00000000c201', current_date + 1, 1, 2, 3, 4)$$,
  'SR-351: workspace member can write ML forecasts'
);
select lives_ok(
  $$insert into public.aurora_ml_metrics (ws_id, model, rmse, directional_accuracy, turning_point_accuracy, weighted_score) values ('00000000-0000-4000-8000-00000000c201', 'member-write', 1, 1, 1, 1)$$,
  'SR-351: workspace member can write ML metrics'
);
select lives_ok(
  $$insert into public.aurora_statistical_forecast (ws_id, date, auto_arima, auto_arima_lo_90, auto_arima_hi_90, auto_ets, auto_ets_lo_90, auto_ets_hi_90, auto_theta, auto_theta_lo_90, auto_theta_hi_90, ces, ces_lo_90, ces_hi_90) values ('00000000-0000-4000-8000-00000000c201', current_date + 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)$$,
  'SR-351: workspace member can write statistical forecasts'
);
select lives_ok(
  $$insert into public.aurora_statistical_metrics (ws_id, model, rmse, directional_accuracy, turning_point_accuracy, weighted_score, no_scaling) values ('00000000-0000-4000-8000-00000000c201', 'member-write', 1, 1, 1, 1, false)$$,
  'SR-351: workspace member can write statistical metrics'
);

select lives_ok(
  $$update public.notes set title = 'Owner edit', content = '{"type":"doc","content":[]}' where id = '00000000-0000-4000-8000-00000000c301'$$,
  'SR-349: note owner can still edit a note in their workspace'
);
select throws_ok(
  $$update public.notes set ws_id = '00000000-0000-4000-8000-00000000c202' where id = '00000000-0000-4000-8000-00000000c301'$$,
  '42501', null,
  'SR-349: note owner cannot move a note to a workspace they do not belong to'
);
select is(
  (select ws_id from public.notes where id = '00000000-0000-4000-8000-00000000c301'),
  '00000000-0000-4000-8000-00000000c201'::uuid,
  'SR-349: failed note move leaves the original workspace pinned'
);
select ok(
  coalesce((
    select pg_get_expr(polwithcheck, polrelid) like '%workspace_members%'
    from pg_policy
    where polrelid = 'public.notes'::regclass
      and polname = 'Users can update their own notes'
  ), false),
  'SR-349: update policy checks membership of the resulting note workspace'
);

select lives_ok(
  $$insert into public.live_api_sessions (user_id, ws_id, session_handle, expires_at, scope_key) values ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c201', 'member-session-handle', now() + interval '1 hour', 'assistant:web-dashboard')$$,
  'SR-350: live session can be registered in a member workspace'
);
select throws_ok(
  $$insert into public.live_api_sessions (user_id, ws_id, session_handle, expires_at, scope_key) values ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c202', 'foreign-session-handle', now() + interval '1 hour', 'assistant:web-dashboard')$$,
  '42501', null,
  'SR-350: live session cannot be registered in a foreign workspace'
);

select lives_ok(
  $$insert into public.calendar_auth_tokens (id, user_id, ws_id, access_token, refresh_token) values ('00000000-0000-4000-8000-00000000c402', '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c201', 'access-2', 'refresh-2')$$,
  'SR-352: calendar OAuth token can be inserted for a member workspace'
);
select throws_ok(
  $$insert into public.calendar_auth_tokens (id, user_id, ws_id, access_token, refresh_token) values ('00000000-0000-4000-8000-00000000c403', '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c202', 'foreign-access', 'foreign-refresh')$$,
  '42501', null,
  'SR-352: calendar OAuth token cannot be inserted for a foreign workspace'
);
select throws_ok(
  $$update public.calendar_auth_tokens set ws_id = '00000000-0000-4000-8000-00000000c202' where id = '00000000-0000-4000-8000-00000000c401'$$,
  '42501', null,
  'SR-352: calendar OAuth token cannot be re-homed into a foreign workspace'
);


select is((select count(*)::integer from public.calendar_auth_tokens), 2, 'SR-352: calendar token RLS exposes only caller rows');
select is((select count(*)::integer from public.calendar_auth_tokens where id = '00000000-0000-4000-8000-00000000c406'), 0, 'SR-352: calendar token RLS hides another user row');

select ok(not has_table_privilege('anon', 'public.calendar_auth_tokens', 'TRUNCATE'), 'F6: anon cannot truncate calendar tokens');
select ok(not has_table_privilege('anon', 'public.calendar_auth_tokens', 'REFERENCES'), 'F6: anon has no calendar token REFERENCES privilege');
select ok(not has_table_privilege('anon', 'public.calendar_auth_tokens', 'TRIGGER'), 'F6: anon has no calendar token TRIGGER privilege');
select ok(not has_table_privilege('authenticated', 'public.calendar_auth_tokens', 'TRUNCATE'), 'F6: authenticated cannot truncate calendar tokens');
select ok(not has_table_privilege('authenticated', 'public.calendar_auth_tokens', 'REFERENCES'), 'F6: authenticated has no calendar token REFERENCES privilege');
select ok(not has_table_privilege('authenticated', 'public.calendar_auth_tokens', 'TRIGGER'), 'F6: authenticated has no calendar token TRIGGER privilege');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c102","email":"rls-invitee@example.com","role":"authenticated"}', true);
select ok(exists (select 1 from public.workspaces where id = '00000000-0000-4000-8000-00000000c202'), 'SR-351: pending email invite still makes the workspace visible');
select is((select count(*)::integer from public.aurora_ml_forecast where ws_id = '00000000-0000-4000-8000-00000000c202'), 0, 'SR-351: workspace invitee cannot read ML forecasts');
select is((select count(*)::integer from public.aurora_ml_metrics where ws_id = '00000000-0000-4000-8000-00000000c202'), 0, 'SR-351: workspace invitee cannot read ML metrics');
select is((select count(*)::integer from public.aurora_statistical_forecast where ws_id = '00000000-0000-4000-8000-00000000c202'), 0, 'SR-351: workspace invitee cannot read statistical forecasts');
select is((select count(*)::integer from public.aurora_statistical_metrics where ws_id = '00000000-0000-4000-8000-00000000c202'), 0, 'SR-351: workspace invitee cannot read statistical metrics');
select is((select count(*)::integer from public.workspace_roles where ws_id = '00000000-0000-4000-8000-00000000c202'), 0, 'SR-351: workspace invitee cannot list role names');

select throws_ok(
  $$insert into public.aurora_ml_metrics (ws_id, model, rmse, directional_accuracy, turning_point_accuracy, weighted_score) values ('00000000-0000-4000-8000-00000000c202', 'forged', 1, 1, 1, 1)$$,
  '42501', null,
  'SR-351: pending invitee cannot write Aurora metrics'
);

reset role;
select * from finish();
rollback;
