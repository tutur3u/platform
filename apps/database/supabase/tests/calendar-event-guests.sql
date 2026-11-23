begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

-- Fixtures: 8701 manager, 8702 external guest (not a member), 8703 stranger.
insert into auth.users (id)
values
  ('00000000-0000-4000-8000-000000008701'),
  ('00000000-0000-4000-8000-000000008702'),
  ('00000000-0000-4000-8000-000000008703')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-4000-8000-000000008711',
  'Calendar guests workspace',
  false,
  '00000000-0000-4000-8000-000000008701'
)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values (
  '00000000-0000-4000-8000-000000008711',
  '00000000-0000-4000-8000-000000008701',
  'MEMBER'
)
on conflict (ws_id, user_id) do nothing;

insert into public.workspace_calendar_events (
  id, ws_id, title, description, start_at, end_at
)
values
  (
    '00000000-0000-4000-8000-000000008721',
    '00000000-0000-4000-8000-000000008711',
    'Guest fixture', '',
    '2026-12-01 09:00:00+00', '2026-12-01 10:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000008722',
    '00000000-0000-4000-8000-000000008711',
    'Cap fixture', '',
    '2026-12-02 09:00:00+00', '2026-12-02 10:00:00+00'
  );

insert into public.calendar_event_invitation_settings (
  event_id, ws_id, organizer_user_id, ical_uid, guests_can_see_guest_list
)
values (
  '00000000-0000-4000-8000-000000008721',
  '00000000-0000-4000-8000-000000008711',
  '00000000-0000-4000-8000-000000008701',
  'fixture-8721@calendar.tuturuuu.com',
  false
);

insert into public.calendar_event_guests (
  id, ws_id, event_id, email, user_id, is_organizer, source
)
values
  (
    '00000000-0000-4000-8000-000000008731',
    '00000000-0000-4000-8000-000000008711',
    '00000000-0000-4000-8000-000000008721',
    'organizer@example.com',
    '00000000-0000-4000-8000-000000008701',
    true, 'member'
  ),
  (
    '00000000-0000-4000-8000-000000008732',
    '00000000-0000-4000-8000-000000008711',
    '00000000-0000-4000-8000-000000008721',
    'guest@example.com',
    '00000000-0000-4000-8000-000000008702',
    false, 'email'
  ),
  (
    '00000000-0000-4000-8000-000000008733',
    '00000000-0000-4000-8000-000000008711',
    '00000000-0000-4000-8000-000000008721',
    'hidden@example.com',
    null, false, 'email'
  );

-- Shape and access control.
select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.calendar_event_invitation_settings'::regclass,
    'public.calendar_event_guests'::regclass,
    'public.calendar_invite_tokens'::regclass,
    'public.calendar_invite_suppressions'::regclass,
    'public.calendar_invite_deliveries'::regclass,
    'public.calendar_invite_send_fences'::regclass,
    'public.calendar_invite_audit'::regclass
  )),
  'every invitation table has RLS enabled'
);

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated')
      and table_schema = 'public'
      and table_name in (
        'calendar_event_invitation_settings', 'calendar_event_guests',
        'calendar_invite_tokens', 'calendar_invite_suppressions',
        'calendar_invite_deliveries', 'calendar_invite_send_fences',
        'calendar_invite_audit'
      )
  ),
  'invitation tables are proxy-only for anon and authenticated'
);

select ok(
  not has_function_privilege('authenticated',
    'public.calendar_invite_quota_check(uuid,uuid,integer,integer,integer,integer)',
    'EXECUTE'),
  'authenticated cannot read send quotas'
);
select ok(
  not has_function_privilege('authenticated',
    'public.calendar_invite_claim_deliveries(integer,integer)', 'EXECUTE'),
  'authenticated cannot claim deliveries'
);
select ok(
  not has_function_privilege('anon',
    'public.calendar_respond_to_event(uuid,text,text)', 'EXECUTE'),
  'anon cannot RSVP through the app RPC'
);
select ok(
  has_function_privilege('authenticated',
    'public.calendar_respond_to_event(uuid,text,text)', 'EXECUTE'),
  'signed-in guests can RSVP through the app RPC'
);

-- Integrity.
select throws_ok(
  $$insert into public.calendar_event_guests (ws_id, event_id, email)
    values ('00000000-0000-4000-8000-000000008799',
            '00000000-0000-4000-8000-000000008721', 'x@example.com')$$,
  null, null,
  'a guest row cannot claim another workspace'
);
select throws_ok(
  $$insert into public.calendar_event_guests (ws_id, event_id, email)
    values ('00000000-0000-4000-8000-000000008711',
            '00000000-0000-4000-8000-000000008721', 'Mixed@Example.com')$$,
  '23514', null,
  'guest emails must be stored normalised'
);
select throws_ok(
  $$insert into public.calendar_event_guests (ws_id, event_id, email)
    values ('00000000-0000-4000-8000-000000008711',
            '00000000-0000-4000-8000-000000008721', 'guest@example.com')$$,
  '23505', null,
  'one guest row per event and email'
);
select throws_ok(
  $$insert into public.calendar_event_guests (ws_id, event_id, email, is_organizer)
    values ('00000000-0000-4000-8000-000000008711',
            '00000000-0000-4000-8000-000000008721', 'second@example.com', true)$$,
  '23505', null,
  'an event has at most one organizer'
);
select throws_ok(
  $$update public.calendar_event_guests set rsvp_status = 'maybe'
    where id = '00000000-0000-4000-8000-000000008732'$$,
  '23514', null,
  'RSVP status is constrained'
);

select lives_ok(
  $$insert into public.calendar_event_guests (ws_id, event_id, email)
    select '00000000-0000-4000-8000-000000008711',
           '00000000-0000-4000-8000-000000008722',
           'cap' || n || '@example.com'
    from generate_series(1, 100) as n$$,
  'an event accepts 100 guests'
);
select throws_ok(
  $$insert into public.calendar_event_guests (ws_id, event_id, email)
    values ('00000000-0000-4000-8000-000000008711',
            '00000000-0000-4000-8000-000000008722', 'cap101@example.com')$$,
  '23514', 'calendar event guest limit reached',
  'the 101st guest is rejected'
);

-- Quotas, dedupe and the stop fence.
insert into public.calendar_invite_deliveries (
  ws_id, event_id, guest_id, recipient_email, method, kind,
  ical_sequence, idempotency_key, requested_by
)
values (
  '00000000-0000-4000-8000-000000008711',
  '00000000-0000-4000-8000-000000008721',
  '00000000-0000-4000-8000-000000008732',
  'guest@example.com', 'REQUEST', 'invite', 0,
  'fixture-8721-8732-0-REQUEST',
  '00000000-0000-4000-8000-000000008701'
);

select throws_ok(
  $$insert into public.calendar_invite_deliveries (
      ws_id, recipient_email, method, kind, ical_sequence, idempotency_key
    ) values ('00000000-0000-4000-8000-000000008711', 'guest@example.com',
      'REQUEST', 'invite', 0, 'fixture-8721-8732-0-REQUEST')$$,
  '23505', null,
  'the same invite version is never queued twice'
);
select is(
  public.calendar_invite_quota_check(
    '00000000-0000-4000-8000-000000008711',
    '00000000-0000-4000-8000-000000008701', 1),
  null,
  'a small send is within quota'
);
select is(
  public.calendar_invite_quota_check(
    '00000000-0000-4000-8000-000000008711',
    '00000000-0000-4000-8000-000000008701', 60),
  'user_hourly',
  'the per-user hourly quota counts queued deliveries'
);
select is(
  public.calendar_invite_quota_check(
    '00000000-0000-4000-8000-000000008711',
    '00000000-0000-4000-8000-000000008701', 5, 1000, 5, 1000),
  'workspace_daily',
  'the per-workspace daily quota is enforced'
);

insert into public.calendar_invite_send_fences (ws_id, reason)
values ('00000000-0000-4000-8000-000000008711', 'fixture stop');

select is(
  public.calendar_invite_quota_check(
    '00000000-0000-4000-8000-000000008711',
    '00000000-0000-4000-8000-000000008701', 1),
  'stopped',
  'a workspace fence stops new sends'
);
select is(
  (select count(*) from public.calendar_invite_claim_deliveries(10, 60)),
  0::bigint,
  'a workspace fence stops queued deliveries from being claimed'
);

update public.calendar_invite_send_fences set stopped = false
where ws_id = '00000000-0000-4000-8000-000000008711';

select is(
  (select count(*) from public.calendar_invite_claim_deliveries(10, 60)),
  1::bigint,
  'due deliveries are claimed once the fence lifts'
);
select is(
  (select count(*) from public.calendar_invite_claim_deliveries(10, 60)),
  0::bigint,
  'a leased delivery is not claimed twice'
);

update public.calendar_invite_deliveries
set lease_expires_at = now() - interval '1 minute'
where idempotency_key = 'fixture-8721-8732-0-REQUEST';

select is(
  (select count(*) from public.calendar_invite_claim_deliveries(10, 60)),
  0::bigint,
  'an expired send lease is never re-sent'
);
select is(
  (select status from public.calendar_invite_deliveries
   where idempotency_key = 'fixture-8721-8732-0-REQUEST'),
  'unknown',
  'an expired send lease settles as unknown'
);

select ok(
  not has_function_privilege('authenticated',
    'public.calendar_invite_enqueue(uuid,uuid,jsonb,integer,boolean,integer,integer,integer)',
    'EXECUTE'),
  'authenticated cannot enqueue deliveries'
);
select is(
  public.calendar_invite_enqueue(
    '00000000-0000-4000-8000-000000008711',
    '00000000-0000-4000-8000-000000008701',
    '[]'::jsonb, 60, true
  ) ->> 'blocked',
  'user_hourly',
  'enqueue applies the quota inside its transaction'
);

-- Guest-facing RLS and RPCs, with rollback-only grants for the policy checks.
grant select on public.calendar_event_guests to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000008702', true);

select is(
  (select count(*) from public.calendar_event_guests),
  1::bigint,
  'an external guest sees only their own guest row'
);
select is(
  (select array_agg(email order by email)
   from public.calendar_list_event_guests_for_guest(
     '00000000-0000-4000-8000-000000008721')),
  array['guest@example.com', 'organizer@example.com'],
  'a hidden guest list shows only the guest and the organizer'
);
select is(
  (public.calendar_respond_to_event(
    '00000000-0000-4000-8000-000000008721', 'tentative', 'Maybe late')).rsvp_status,
  'tentative',
  'a guest can answer their own invitation'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000008703', true);

select throws_ok(
  $$select public.calendar_respond_to_event(
      '00000000-0000-4000-8000-000000008721', 'accepted')$$,
  '42501', null,
  'a stranger cannot answer an invitation'
);
select is(
  (select count(*) from public.calendar_event_guests),
  0::bigint,
  'a stranger sees no guest rows'
);

select * from finish();
rollback;
