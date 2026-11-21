// Source-bound push notification findings fixed by a forward ACL migration.
module.exports = [
  {
    path: 'apps/database/supabase/migrations/20261121105801_send_push_batches_immediately.sql',
    line: 31,
    rule: 'function-acl',
    fileDigest:
      'aa576f5545d6a42dbba4e39f48c6c7c8f6bd79fd5b5d32f90a242bced0af89ac',
    digest: '9bda0273cc353ce929ab08f0b524f94a477016d950f70c6e62e880e4d3da1cbf',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121111447_harden_push_function_acls.sql',
    reason:
      'The follow-up revokes ALL from PUBLIC, anon and authenticated and grants EXECUTE on private.push_recipient_reachable(uuid) to service_role only.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121105801_send_push_batches_immediately.sql',
    line: 51,
    rule: 'function-acl',
    fileDigest:
      'aa576f5545d6a42dbba4e39f48c6c7c8f6bd79fd5b5d32f90a242bced0af89ac',
    digest: '9260cc31990b2cb14be264c7cdb14acf763015e7af58351b1085d33a80cd93f9',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121111447_harden_push_function_acls.sql',
    reason:
      'The follow-up revokes ALL from PUBLIC, anon and authenticated and grants EXECUTE on private.push_immediate_admitted(uuid) to service_role only.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121105801_send_push_batches_immediately.sql',
    line: 95,
    rule: 'function-acl',
    fileDigest:
      'aa576f5545d6a42dbba4e39f48c6c7c8f6bd79fd5b5d32f90a242bced0af89ac',
    digest: '1d8f369eb345265958c922a5bc1a2d2f3d1fd3467d5739398d59b79def22f94e',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121111447_harden_push_function_acls.sql',
    reason:
      'The follow-up redefines public.get_or_create_notification_batch, revokes ALL from PUBLIC, anon and authenticated and grants EXECUTE to service_role only.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121105801_send_push_batches_immediately.sql',
    line: 95,
    rule: 'definer-search-path',
    fileDigest:
      'aa576f5545d6a42dbba4e39f48c6c7c8f6bd79fd5b5d32f90a242bced0af89ac',
    digest: '1d8f369eb345265958c922a5bc1a2d2f3d1fd3467d5739398d59b79def22f94e',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121111447_harden_push_function_acls.sql',
    reason:
      'The follow-up redefines public.get_or_create_notification_batch with search_path pg_catalog, private, public, pg_temp and an unchanged body.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121105801_send_push_batches_immediately.sql',
    line: 219,
    rule: 'definer-search-path',
    fileDigest:
      'aa576f5545d6a42dbba4e39f48c6c7c8f6bd79fd5b5d32f90a242bced0af89ac',
    digest: 'c386dd2b880029dcb55a812eca7dd896719b9b3a845aaba40fc42e489490559b',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121111447_harden_push_function_acls.sql',
    reason:
      'The follow-up redefines private.requeue_mail_push_batches with search_path pg_catalog, pg_temp; its body qualifies every relation.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121105803_push_delivery_latency.sql',
    line: 5,
    rule: 'function-acl',
    fileDigest:
      'cc8cc431954504d5ac19d32e7d91b3d0fb8168eb484beb5a583d905b4c898aa9',
    digest: 'b9a1abec5be5d662af7c78cc81959fc97b2a4e04f244787b05862aa796b87eda',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121111447_harden_push_function_acls.sql',
    reason:
      'The follow-up revokes ALL from PUBLIC, anon and authenticated and grants EXECUTE on private.push_delivery_latency_summary(timestamptz) to service_role only.',
  },
  {
    path: 'apps/database/supabase/migrations/20261121110640_pin_push_requeue_search_path.sql',
    line: 3,
    rule: 'definer-search-path',
    fileDigest:
      'e5b0d47981325741d6c4b06c8b9ef82d26a0cf6b633487d1481b92f8fb441c2f',
    digest: '39c1dfac66fa9c452f50602185a0bbefae7274dda1238220124961ca8d9abe16',
    class: 'fixed-forward',
    requiredMigration:
      'apps/database/supabase/migrations/20261121111447_harden_push_function_acls.sql',
    reason:
      'The follow-up replaces this ALTER with a complete CREATE definition of private.requeue_mail_push_batches pinned to pg_catalog, pg_temp.',
  },
];
