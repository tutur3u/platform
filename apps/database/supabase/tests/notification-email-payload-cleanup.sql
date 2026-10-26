begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

select set_config('request.jwt.claims', '{}', true);
insert into auth.users (id, email, email_confirmed_at)
values ('fa120000-0000-0000-0000-000000000010', 'payload-batch-proof@example.test', now());
insert into public.users (id)
values ('fa120000-0000-0000-0000-000000000010') on conflict do nothing;

create temporary table notification_payload_check_before as
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.notifications'::regclass
  and conname = 'data_strict_payload_size_check';

alter table public.notifications drop constraint data_strict_payload_size_check;

-- Model historical rows without current normalization or payload triggers.
set local session_replication_role = replica;
insert into public.notifications (id, user_id, email, scope, type, title, data)
values
  ('fa120000-0000-0000-0000-000000000001',
   'fa120000-0000-0000-0000-000000000010', 'legacy@example.test', 'user',
   'task_description_changed', 'Legacy payload',
   jsonb_build_object('changes', jsonb_build_object('description', repeat('x', 100000)))),
  ('fa120000-0000-0000-0000-000000000002',
   'fa120000-0000-0000-0000-000000000010', 'safe@example.test', 'user',
   'task_description_changed', 'Safe payload', '{}'),
  ('fa120000-0000-0000-0000-000000000003',
   'fa120000-0000-0000-0000-000000000010', 'null@example.test', 'user',
   'task_description_changed', 'Null payload', null);
set local session_replication_role = origin;

do $$
declare r record;
begin
  select * into strict r from notification_payload_check_before;
  execute format('alter table public.notifications add constraint %I %s',
    r.conname, r.definition);
end;
$$;

create temporary table notification_payload_oid_before as
select oid from pg_constraint
where conrelid = 'public.notifications'::regclass
  and conname = 'data_strict_payload_size_check';

select is(private.clear_notification_email_copy_batch(500), 2,
  'The regular batch cleans safe and null payloads without touching legacy oversized rows');
select is((select email from public.notifications
  where id = 'fa120000-0000-0000-0000-000000000001'),
  'legacy@example.test', 'The oversized row remains for the atomic tail');
select is((select convert_to(data::text, 'UTF8') from public.notifications
  where id = 'fa120000-0000-0000-0000-000000000001'),
  convert_to(jsonb_build_object('changes', jsonb_build_object('description',
    repeat('x', 100000)))::text, 'UTF8'), 'The legacy payload is byte-identical');
select is((select count(*) from public.notifications
  where id in ('fa120000-0000-0000-0000-000000000002',
    'fa120000-0000-0000-0000-000000000003') and email is null),
  2::bigint, 'Safe and null payload email copies are cleared');
select is(private.clear_notification_email_copy_batch(500), 0,
  'The regular batch terminates when only oversized rows remain');
select is((select oid from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and conname = 'data_strict_payload_size_check'),
  (select oid from notification_payload_oid_before),
  'The regular batch never replaces the constraint');
select ok((select not convalidated from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and conname = 'data_strict_payload_size_check'),
  'The existing constraint remains NOT VALID');

select * from finish();
rollback;
