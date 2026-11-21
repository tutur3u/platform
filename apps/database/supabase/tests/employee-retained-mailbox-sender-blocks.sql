begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);

insert into private.mail_domains (id, domain, status, inbound_provider, verified_at)
values (
  'e24b0000-0000-4000-8000-000000000001',
  'retained-sender-blocks.tuturuuu.com',
  'active', 'cloudflare', now()
);

insert into private.mail_mailboxes (id, domain_id, address, type, status)
values (
  'e24b0000-0000-4000-8000-000000000002',
  'e24b0000-0000-4000-8000-000000000001',
  'fixture@retained-sender-blocks.tuturuuu.com',
  'personal', 'disabled'
);

select lives_ok(
  $$select private.employee_retained_mailbox_content(
    'e24b0000-0000-4000-8000-000000000002', 'e24b0000-0000-4000-8000-000000000003'
  )$$,
  'the retained mailbox catalog admits a mailbox with no sender blocks'
);

insert into private.mail_sender_blocks (mailbox_id, kind, value)
values ('e24b0000-0000-4000-8000-000000000002', 'domain', 'blocked.example.com');

select throws_ok(
  $$select private.employee_retained_mailbox_content(
    'e24b0000-0000-4000-8000-000000000002', 'e24b0000-0000-4000-8000-000000000003'
  )$$,
  '23514', 'Retained mailbox foreign access or dependency',
  'a sender block still prevents retained mailbox adoption'
);

select * from finish();
rollback;
