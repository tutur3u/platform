begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(11);

-- Fixtures bypass the workspace foreign keys so the cap can be exercised alone.
set local session_replication_role = replica;
insert into private.newsletter_sending_domains (
  id, ws_id, subdomain, approval, dkim_verified, mail_from_verified,
  txt_verified, ownership_token_hash, dns_records, mail_from_domain
) values (
  'c0000000-0000-4000-8000-0000000000d1',
  'c0000000-0000-4000-8000-0000000000a1',
  'news.cap-fixture.example', 'approved', true, true, true,
  repeat('a', 64), '[{"type":"CNAME","name":"k._domainkey","value":"k.dkim.example"}]',
  'bounce.news.cap-fixture.example'
);
insert into private.newsletter_sender_addresses (ws_id, domain_id, local_part, approval)
values (
  'c0000000-0000-4000-8000-0000000000a1',
  'c0000000-0000-4000-8000-0000000000d1',
  'hello', 'approved'
);
set local session_replication_role = origin;

create function pg_temp.reserve() returns jsonb language sql as $$
  select private.newsletter_reserve_staff_delivery(
    'c0000000-0000-4000-8000-0000000000a1',
    'c0000000-0000-4000-8000-0000000000b1',
    'owner@cap-fixture.example', 'hello', 'owner@cap-fixture.example', true
  )
$$;

select is(
  (select count(*) from private.newsletter_deliveries), 0::bigint,
  'fixture starts without deliveries'
);

create temp table cap_ids (n int, id uuid);
insert into cap_ids
select n, (pg_temp.reserve() ->> 'id')::uuid from generate_series(1, 10) n;

select is(
  (select count(*) from private.newsletter_deliveries where status = 'reserved'),
  10::bigint,
  'ten reservations are held without any accepted delivery'
);

select is(
  (select count(*) from private.newsletter_deliveries
   where reserved_on = (timezone('UTC', now()))::date),
  10::bigint,
  'reservations record the UTC reservation day'
);

select throws_ok(
  $$select pg_temp.reserve()$$, 'P0001', 'newsletter_daily_cap',
  'an eleventh reservation is refused while ten are still in flight'
);

select is(
  (select count(*) from private.newsletter_deliveries), 10::bigint,
  'a refused reservation leaves no delivery row'
);

select private.newsletter_finish_staff_delivery(
  'c0000000-0000-4000-8000-0000000000a1',
  (select id from cap_ids where n = 1), 'accepted'
);
select throws_ok(
  $$select pg_temp.reserve()$$, 'P0001', 'newsletter_daily_cap',
  'an accepted delivery keeps its slot'
);

select private.newsletter_finish_staff_delivery(
  'c0000000-0000-4000-8000-0000000000a1',
  (select id from cap_ids where n = 2), 'rejected'
);
select lives_ok(
  $$select pg_temp.reserve()$$,
  'a definite mailer rejection releases its slot'
);
select throws_ok(
  $$select pg_temp.reserve()$$, 'P0001', 'newsletter_daily_cap',
  'the released slot is reusable only once'
);

-- A reservation from an earlier UTC day does not count toward today.
update private.newsletter_deliveries
  set reserved_on = reserved_on - 1
  where id = (select id from cap_ids where n = 3);
select lives_ok(
  $$select pg_temp.reserve()$$,
  'yesterday reservation frees a slot today'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.newsletter_reserve_staff_delivery(uuid, uuid, text, text, text, boolean)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'private.newsletter_reserve_staff_delivery(uuid, uuid, text, text, text, boolean)',
    'execute'
  ),
  'only service_role may reserve a delivery'
);

select is(
  (select count(*) from pg_indexes
   where schemaname = 'private' and indexname = 'newsletter_deliveries_cap_day'),
  1::bigint,
  'the cap-day index exists'
);

select * from finish();
rollback;
