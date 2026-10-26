begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(19);

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

-- Daily summaries: A writes 70, B writes 71, then A is retried.
select is(
  (select replayed from public.record_habit_tracker_entry_with_receipt(
    '00000000-0000-4000-8000-00000000a611', '00000000-0000-4000-8000-00000000a621', '00000000-0000-4000-8000-00000000a601',
    'mira:weight-a', repeat('a', 64), 'daily_summary', '2026-10-25', now(),
    jsonb_build_object('weight', 70), 70, null, '{}'
  )),
  false,
  'operation A is accepted'
);

select is(
  (select replayed from public.record_habit_tracker_entry_with_receipt(
    '00000000-0000-4000-8000-00000000a611', '00000000-0000-4000-8000-00000000a621', '00000000-0000-4000-8000-00000000a601',
    'mira:weight-b', repeat('b', 64), 'daily_summary', '2026-10-25', now(),
    jsonb_build_object('weight', 71), 71, null, '{}'
  )),
  false,
  'operation B is accepted for the same day'
);

select is(
  (select replayed from public.record_habit_tracker_entry_with_receipt(
    '00000000-0000-4000-8000-00000000a611', '00000000-0000-4000-8000-00000000a621', '00000000-0000-4000-8000-00000000a601',
    'mira:weight-a', repeat('a', 64), 'daily_summary', '2026-10-25', now(),
    jsonb_build_object('weight', 70), 70, null, '{}'
  )),
  true,
  'retrying A after B replays instead of writing'
);

select is(
  (
    select primary_value
    from public.workspace_habit_tracker_entries
    where tracker_id = '00000000-0000-4000-8000-00000000a621' and entry_kind = 'daily_summary'
      and entry_date = '2026-10-25'
  ),
  71::numeric,
  'the A/B/A retry keeps the newer daily value'
);

select is(
  (
    select count(distinct entry_id)::integer || ':' || count(*)::integer
    from public.workspace_habit_tracker_entry_receipts
    where tracker_id = '00000000-0000-4000-8000-00000000a621'
  ),
  '1:2',
  'both operations keep immutable receipts for the one daily summary row'
);

select throws_ok(
  $$ select * from public.record_habit_tracker_entry_with_receipt(
    '00000000-0000-4000-8000-00000000a611', '00000000-0000-4000-8000-00000000a621', '00000000-0000-4000-8000-00000000a601',
    'mira:weight-a', repeat('c', 64), 'daily_summary', '2026-10-25', now(),
    jsonb_build_object('weight', 72), 72, null, '{}'
  ) $$,
  'P0409',
  null,
  'reusing a key for a different request body is rejected'
);

select is(
  (
    select primary_value
    from public.workspace_habit_tracker_entries
    where tracker_id = '00000000-0000-4000-8000-00000000a621' and entry_kind = 'daily_summary'
      and entry_date = '2026-10-25'
  ),
  71::numeric,
  'a rejected key reuse leaves the daily value unchanged'
);

-- Event log entries: a retried operation writes once.
select is(
  (select replayed from public.record_habit_tracker_entry_with_receipt(
    '00000000-0000-4000-8000-00000000a611', '00000000-0000-4000-8000-00000000a621', '00000000-0000-4000-8000-00000000a601',
    'mira:water-0001', repeat('d', 64), 'event_log', '2026-10-26', now(),
    jsonb_build_object('weight', 1), 1, null, '{}'
  )),
  false,
  'an event entry operation is accepted'
);

select is(
  (select replayed from public.record_habit_tracker_entry_with_receipt(
    '00000000-0000-4000-8000-00000000a611', '00000000-0000-4000-8000-00000000a621', '00000000-0000-4000-8000-00000000a601',
    'mira:water-0001', repeat('d', 64), 'event_log', '2026-10-26', now(),
    jsonb_build_object('weight', 1), 1, null, '{}'
  )),
  true,
  'a retried event entry replays'
);

select is(
  (
    select count(*)::integer
    from public.workspace_habit_tracker_entries
    where tracker_id = '00000000-0000-4000-8000-00000000a621' and entry_date = '2026-10-26'
  ),
  1,
  'a retried event entry is stored once'
);

-- Deleting an accepted entry keeps its receipt, so a late retry cannot
-- resurrect it.
delete from public.workspace_habit_tracker_entries
where tracker_id = '00000000-0000-4000-8000-00000000a621' and entry_date = '2026-10-26';

select is(
  (
    select coalesce(entry_id::text, 'none') || ':' || replayed::text
    from public.record_habit_tracker_entry_with_receipt(
    '00000000-0000-4000-8000-00000000a611', '00000000-0000-4000-8000-00000000a621', '00000000-0000-4000-8000-00000000a601',
    'mira:water-0001', repeat('d', 64), 'event_log', '2026-10-26', now(),
    jsonb_build_object('weight', 1), 1, null, '{}'
  )
  ),
  'none:true',
  'a retry after deletion replays without recreating the entry'
);

select throws_ok(
  $$ select * from public.record_habit_tracker_entry_with_receipt(
    '00000000-0000-4000-8000-00000000a6ff', '00000000-0000-4000-8000-00000000a621', '00000000-0000-4000-8000-00000000a601',
    'mira:other-ws-01', repeat('e', 64), 'event_log', '2026-10-25', now(),
    jsonb_build_object('weight', 1), 1, null, '{}'
  ) $$,
  'P0404',
  null,
  'the tracker must belong to the given workspace'
);

select throws_ok(
  $$ select * from public.record_habit_tracker_entry_with_receipt(
    '00000000-0000-4000-8000-00000000a611', '00000000-0000-4000-8000-00000000a621', '00000000-0000-4000-8000-00000000a601',
    'short', repeat('f', 64), 'event_log', '2026-10-25', now(),
    jsonb_build_object('weight', 1), 1, null, '{}'
  ) $$,
  '23514',
  null,
  'operation keys must match the allowed format'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_habit_tracker_entry_with_receipt(uuid, uuid, uuid, text, text, text, date, timestamptz, jsonb, numeric, text, text[])',
    'execute'
  )
  and not has_table_privilege(
    'authenticated',
    'public.workspace_habit_tracker_entry_receipts',
    'select, insert, update'
  )
  and not has_table_privilege(
    'authenticated',
    'public.workspace_habit_trackers',
    'insert, update'
  )
  and not has_table_privilege(
    'authenticated',
    'public.workspace_habit_tracker_entries',
    'insert, update'
  ),
  'keyed writes stay service-role only'
);

select * from finish();

rollback;
