begin;

select plan(26);

select has_table('public', 'tulearn_parent_student_links', 'parent student links table exists');
select has_table('public', 'tulearn_parent_invites', 'parent invites table exists');
select has_table('public', 'tulearn_gamification_events', 'gamification events table exists');
select has_table('public', 'tulearn_learner_state', 'learner state table exists');

select has_column('public', 'tulearn_parent_student_links', 'parent_user_id', 'links store the parent platform user');
select has_column('public', 'tulearn_parent_student_links', 'student_workspace_user_id', 'links store the student workspace user');
select has_column('public', 'tulearn_parent_invites', 'token_hash', 'invites store hashed tokens');
select has_column('public', 'tulearn_gamification_events', 'idempotency_key', 'events have idempotency keys');
select has_column('public', 'tulearn_learner_state', 'hearts', 'learner state stores hearts');
select has_column('public', 'tulearn_learner_state', 'xp_total', 'learner state stores total XP');

select indexes_are(
  'public',
  'tulearn_gamification_events',
  array[
    'tulearn_gamification_events_pkey',
    'tulearn_gamification_events_idempotency_key',
    'tulearn_gamification_events_user_created_idx'
  ]
);

select policies_are(
  'public',
  'tulearn_learner_state',
  array[
    'Learners can view own Tulearn state',
    'Learners can insert own Tulearn state',
    'Learners can update own Tulearn state'
  ]
);

select isnt_empty(
  $$
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tulearn_learner_state'
      and policyname = 'Learners can view own Tulearn state'
      and qual like '%workspace_members%'
      and qual like '%auth.uid() = user_id%'
  $$,
  'learner state select policy requires user ownership and workspace membership'
);

select isnt_empty(
  $$
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tulearn_learner_state'
      and policyname = 'Learners can insert own Tulearn state'
      and with_check like '%workspace_members%'
      and with_check like '%selected_workspace_id%'
      and with_check like '%auth.uid() = user_id%'
  $$,
  'learner state insert policy requires owned rows, workspace membership, and selected workspace access'
);

select isnt_empty(
  $$
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tulearn_learner_state'
      and policyname = 'Learners can update own Tulearn state'
      and qual like '%workspace_members%'
      and qual like '%auth.uid() = user_id%'
  $$,
  'learner state update policy requires existing row workspace membership'
);

select isnt_empty(
  $$
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tulearn_learner_state'
      and policyname = 'Learners can update own Tulearn state'
      and with_check like '%workspace_members%'
      and with_check like '%selected_workspace_id%'
      and with_check like '%auth.uid() = user_id%'
  $$,
  'learner state update policy requires selected workspace access'
);

select isnt_empty(
  $$
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tulearn_learner_state'
      and policyname in (
        'Learners can insert own Tulearn state',
        'Learners can update own Tulearn state'
      )
      and with_check like '%selected_wm.ws_id = tulearn_learner_state.selected_workspace_id%'
      and with_check like '%selected_wm.user_id = auth.uid()%'
  $$,
  'learner state selected workspace checks are bound to the authenticated user'
);

select isnt_empty(
  $$
    select 1
    from pg_constraint
    where conname = 'tulearn_learner_state_hearts_lte_max_check'
  $$,
  'learner hearts cannot exceed max hearts'
);

select isnt_empty(
  $$
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'tulearn_parent_student_links'
      and indexname = 'tulearn_parent_student_links_active_key'
  $$,
  'active parent student links are unique'
);

select isnt_empty(
  $$
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'award_tulearn_xp'
  $$,
  'Tulearn XP awards use an atomic RPC'
);

select isnt_empty(
  $$
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'lose_tulearn_heart'
  $$,
  'Tulearn heart loss uses an atomic RPC'
);

insert into public.users (id)
values ('00000000-0000-0000-0000-000000000801')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000000810',
  'Tulearn RPC Workspace',
  false,
  '00000000-0000-0000-0000-000000000801'
)
on conflict (id) do nothing;

select results_eq(
  $$
    select awarded, xp, xp_total, current_streak, longest_streak
    from public.award_tulearn_xp(
      '00000000-0000-0000-0000-000000000810',
      '00000000-0000-0000-0000-000000000801',
      'manual',
      'manual-review-test',
      10,
      'review-thread-test',
      '{}'::jsonb
    )
  $$,
  $$ values (true, 10::integer, 10::integer, 1::integer, 1::integer) $$,
  'award_tulearn_xp creates learner state and awards XP once'
);

select results_eq(
  $$
    select awarded, xp, xp_total, current_streak, longest_streak
    from public.award_tulearn_xp(
      '00000000-0000-0000-0000-000000000810',
      '00000000-0000-0000-0000-000000000801',
      'manual',
      'manual-review-test',
      10,
      'review-thread-test',
      '{}'::jsonb
    )
  $$,
  $$ values (false, 0::integer, 10::integer, 1::integer, 1::integer) $$,
  'duplicate XP awards return the existing learner state without a second award'
);

select results_eq(
  $$
    select hearts
    from public.lose_tulearn_heart(
      '00000000-0000-0000-0000-000000000810',
      '00000000-0000-0000-0000-000000000801'
    )
  $$,
  $$ values (4::integer) $$,
  'lose_tulearn_heart decrements hearts atomically'
);

update public.tulearn_learner_state
set
  hearts = 4,
  last_heart_refill_at = '2026-01-01 00:00:00+00'::timestamp with time zone
where ws_id = '00000000-0000-0000-0000-000000000810'
  and user_id = '00000000-0000-0000-0000-000000000801';

select results_eq(
  $$
    with lost as (
      select hearts
      from public.lose_tulearn_heart(
        '00000000-0000-0000-0000-000000000810',
        '00000000-0000-0000-0000-000000000801'
      )
    )
    select lost.hearts, state.last_heart_refill_at
    from lost
    cross join public.tulearn_learner_state state
    where state.ws_id = '00000000-0000-0000-0000-000000000810'
      and state.user_id = '00000000-0000-0000-0000-000000000801'
  $$,
  $$ values (3::integer, '2026-01-01 00:00:00+00'::timestamp with time zone) $$,
  'repeated heart loss preserves the existing refill timer'
);

update public.tulearn_learner_state
set
  hearts = 0,
  last_heart_refill_at = '2026-01-01 00:00:00+00'::timestamp with time zone
where ws_id = '00000000-0000-0000-0000-000000000810'
  and user_id = '00000000-0000-0000-0000-000000000801';

select results_eq(
  $$
    with lost as (
      select hearts
      from public.lose_tulearn_heart(
        '00000000-0000-0000-0000-000000000810',
        '00000000-0000-0000-0000-000000000801'
      )
    )
    select lost.hearts, state.last_heart_refill_at
    from lost
    cross join public.tulearn_learner_state state
    where state.ws_id = '00000000-0000-0000-0000-000000000810'
      and state.user_id = '00000000-0000-0000-0000-000000000801'
  $$,
  $$ values (0::integer, '2026-01-01 00:00:00+00'::timestamp with time zone) $$,
  'lose_tulearn_heart is a no-op at zero hearts and keeps the refill timer'
);

select * from finish();

rollback;
