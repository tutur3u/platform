begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_contacts',
    'SELECT'
  ),
  'authenticated cannot select topic announcement contacts directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_contacts',
    'INSERT'
  ),
  'authenticated cannot insert topic announcement contacts directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_contacts',
    'UPDATE'
  ),
  'authenticated cannot update topic announcement contacts directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_contacts',
    'DELETE'
  ),
  'authenticated cannot delete topic announcement contacts directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_batches',
    'SELECT'
  ),
  'authenticated cannot select topic announcement batches directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_batches',
    'INSERT'
  ),
  'authenticated cannot insert topic announcement batches directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_batches',
    'UPDATE'
  ),
  'authenticated cannot update topic announcement batches directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_batches',
    'DELETE'
  ),
  'authenticated cannot delete topic announcement batches directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcements',
    'SELECT'
  ),
  'authenticated cannot select topic announcements directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcements',
    'INSERT'
  ),
  'authenticated cannot insert topic announcements directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcements',
    'UPDATE'
  ),
  'authenticated cannot update topic announcements directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcements',
    'DELETE'
  ),
  'authenticated cannot delete topic announcements directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_recipients',
    'SELECT'
  ),
  'authenticated cannot select topic announcement recipients directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_recipients',
    'INSERT'
  ),
  'authenticated cannot insert topic announcement recipients directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_recipients',
    'UPDATE'
  ),
  'authenticated cannot update topic announcement recipients directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_recipients',
    'DELETE'
  ),
  'authenticated cannot delete topic announcement recipients directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_attachments',
    'SELECT'
  ),
  'authenticated cannot select topic announcement attachments directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_attachments',
    'INSERT'
  ),
  'authenticated cannot insert topic announcement attachments directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_attachments',
    'UPDATE'
  ),
  'authenticated cannot update topic announcement attachments directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_attachments',
    'DELETE'
  ),
  'authenticated cannot delete topic announcement attachments directly'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.topic_announcement_contact_verifications',
    'SELECT'
  ),
  'anon cannot select topic announcement contact verifications directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.topic_announcement_contact_verifications',
    'SELECT'
  ),
  'authenticated cannot select topic announcement contact verifications directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.topic_announcement_contact_has_linked_verified_email(uuid)',
    'EXECUTE'
  ),
  'anon cannot execute the linked-email helper directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.topic_announcement_contact_has_linked_verified_email(uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute the linked-email helper directly'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.topic_announcement_contacts',
    'SELECT'
  ),
  'service_role can select topic announcement contacts'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.topic_announcement_contact_verifications',
    'SELECT'
  ),
  'service_role can select topic announcement contact verifications'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.topic_announcement_batches',
    'SELECT'
  ),
  'service_role can select topic announcement batches'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.topic_announcements',
    'SELECT'
  ),
  'service_role can select topic announcements'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.topic_announcement_recipients',
    'SELECT'
  ),
  'service_role can select topic announcement recipients'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.topic_announcement_attachments',
    'SELECT'
  ),
  'service_role can select topic announcement attachments'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'topic_announcement_contacts',
        'topic_announcement_contact_verifications',
        'topic_announcement_batches',
        'topic_announcements',
        'topic_announcement_recipients',
        'topic_announcement_attachments'
      )
      and 'authenticated' = any(roles)
  ),
  0,
  'topic announcement tables have no authenticated RLS policies'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'topic_announcement_contacts',
        'topic_announcement_contact_verifications',
        'topic_announcement_batches',
        'topic_announcements',
        'topic_announcement_recipients',
        'topic_announcement_attachments'
      )
      and 'service_role' = any(roles)
  ),
  6,
  'topic announcement tables keep service-role RLS policies'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'topic_announcement_contacts',
        'topic_announcement_contact_verifications',
        'topic_announcement_batches',
        'topic_announcements',
        'topic_announcement_recipients',
        'topic_announcement_attachments'
      )
      and (
        policyname like 'Allow workspace members to view topic announcement%'
        or policyname like 'Allow workspace members to manage topic announcement%'
      )
  ),
  0,
  'topic announcement member-only policies are removed'
);

select * from finish();

rollback;
