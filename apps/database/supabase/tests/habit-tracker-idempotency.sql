begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(10);

insert into auth.users(id) values ('00000000-0000-4000-8000-00000000a601');
insert into public.users(id)
values ('00000000-0000-4000-8000-00000000a601')
on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id)
values (
  '00000000-0000-4000-8000-00000000a611',
  'Habit idempotency fixture',
  false,
  '00000000-0000-4000-8000-00000000a601'
);
insert into public.workspace_members(ws_id, user_id, type)
values (
  '00000000-0000-4000-8000-00000000a611',
  '00000000-0000-4000-8000-00000000a601',
  'MEMBER'
)
on conflict do nothing;

-- Pre-existing duplicate body weight trackers without keys stay valid.
insert into public.workspace_habit_trackers(id, ws_id, name, created_by)
values
  (
    '00000000-0000-4000-8000-00000000a621',
    '00000000-0000-4000-8000-00000000a611',
    'Legacy weight A',
    '00000000-0000-4000-8000-00000000a601'
  ),
  (
    '00000000-0000-4000-8000-00000000a622',
    '00000000-0000-4000-8000-00000000a611',
    'Legacy weight B',
    '00000000-0000-4000-8000-00000000a601'
  );

select is(
  (
    select count(*)::integer
    from public.workspace_habit_trackers
    where ws_id = '00000000-0000-4000-8000-00000000a611'
      and creation_key is null
  ),
  2,
  'trackers without a creation key may still repeat'
);

insert into public.workspace_habit_trackers(id, ws_id, name, created_by, creation_key)
values (
  '00000000-0000-4000-8000-00000000a623',
  '00000000-0000-4000-8000-00000000a611',
  'Body Weight',
  '00000000-0000-4000-8000-00000000a601',
  'mira:body_weight'
);

select throws_ok(
  $$
    insert into public.workspace_habit_trackers(ws_id, name, created_by, creation_key)
    values (
      '00000000-0000-4000-8000-00000000a611',
      'Body Weight',
      '00000000-0000-4000-8000-00000000a601',
      'mira:body_weight'
    )
  $$,
  '23505',
  null,
  'a second active tracker with the same creation key is rejected'
);

update public.workspace_habit_trackers
set archived_at = now()
where id = '00000000-0000-4000-8000-00000000a623';

select lives_ok(
  $$
    insert into public.workspace_habit_trackers(id, ws_id, name, created_by, creation_key)
    values (
      '00000000-0000-4000-8000-00000000a624',
      '00000000-0000-4000-8000-00000000a611',
      'Body Weight',
      '00000000-0000-4000-8000-00000000a601',
      'mira:body_weight'
    )
  $$,
  'archiving a keyed tracker releases its creation key'
);

update public.workspace_habit_trackers
set is_active = false
where id = '00000000-0000-4000-8000-00000000a624';

select lives_ok(
  $$
    insert into public.workspace_habit_trackers(ws_id, name, created_by, creation_key)
    values (
      '00000000-0000-4000-8000-00000000a611',
      'Body Weight',
      '00000000-0000-4000-8000-00000000a601',
      'mira:body_weight'
    )
  $$,
  'deactivating a keyed tracker releases its creation key'
);

select throws_ok(
  $$
    insert into public.workspace_habit_trackers(ws_id, name, created_by, creation_key)
    values (
      '00000000-0000-4000-8000-00000000a611',
      'Bad key',
      '00000000-0000-4000-8000-00000000a601',
      'bad key!'
    )
  $$,
  '23514',
  null,
  'creation keys must match the allowed format'
);

insert into public.workspace_habit_tracker_entries(
  ws_id, tracker_id, user_id, entry_date, idempotency_key
)
values (
  '00000000-0000-4000-8000-00000000a611',
  '00000000-0000-4000-8000-00000000a621',
  '00000000-0000-4000-8000-00000000a601',
  '2026-10-25',
  'mira:entry-0001'
);

select throws_ok(
  $$
    insert into public.workspace_habit_tracker_entries(
      ws_id, tracker_id, user_id, entry_date, idempotency_key
    )
    values (
      '00000000-0000-4000-8000-00000000a611',
      '00000000-0000-4000-8000-00000000a621',
      '00000000-0000-4000-8000-00000000a601',
      '2026-10-25',
      'mira:entry-0001'
    )
  $$,
  '23505',
  null,
  'a repeated entry operation key is rejected'
);

select lives_ok(
  $$
    insert into public.workspace_habit_tracker_entries(
      ws_id, tracker_id, user_id, entry_date, idempotency_key
    )
    values (
      '00000000-0000-4000-8000-00000000a611',
      '00000000-0000-4000-8000-00000000a622',
      '00000000-0000-4000-8000-00000000a601',
      '2026-10-25',
      'mira:entry-0001'
    )
  $$,
  'the same operation key is independent per tracker'
);

select lives_ok(
  $$
    insert into public.workspace_habit_tracker_entries(
      ws_id, tracker_id, user_id, entry_date
    )
    values
      (
        '00000000-0000-4000-8000-00000000a611',
        '00000000-0000-4000-8000-00000000a621',
        '00000000-0000-4000-8000-00000000a601',
        '2026-10-25'
      ),
      (
        '00000000-0000-4000-8000-00000000a611',
        '00000000-0000-4000-8000-00000000a621',
        '00000000-0000-4000-8000-00000000a601',
        '2026-10-25'
      )
  $$,
  'entries without an operation key keep repeating'
);

select throws_ok(
  $$
    insert into public.workspace_habit_tracker_entries(
      ws_id, tracker_id, user_id, entry_date, idempotency_key
    )
    values (
      '00000000-0000-4000-8000-00000000a611',
      '00000000-0000-4000-8000-00000000a621',
      '00000000-0000-4000-8000-00000000a601',
      '2026-10-25',
      'short'
    )
  $$,
  '23514',
  null,
  'operation keys must match the allowed format'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.workspace_habit_trackers',
    'insert, update'
  )
  and not has_table_privilege(
    'authenticated',
    'public.workspace_habit_tracker_entries',
    'insert, update'
  ),
  'keys stay writable only through the service-role Tasks API'
);

select * from finish();

rollback;
