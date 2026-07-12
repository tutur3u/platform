create extension if not exists pgtap with schema extensions;

begin;

select plan(10);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_pending_invoices_base(uuid,boolean)',
    'execute'
  ),
  'authenticated can call the guarded pending invoice base RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_pending_invoices_base(uuid,boolean)',
    'execute'
  ),
  'anon cannot call the pending invoice base RPC directly'
);

select throws_ok(
  $$ select * from public.get_pending_invoices_base(
    '00000000-0000-0000-0000-000000000001'::uuid,
    true
  ) $$,
  'P0001',
  'Unauthorized: User does not have permission to view invoices for workspace 00000000-0000-0000-0000-000000000001',
  'pending invoice base RPC rejects callers without view_invoices'
);

select throws_ok(
  $$ select * from public.get_pending_invoices(
    '00000000-0000-0000-0000-000000000001'::uuid
  ) $$,
  'P0001',
  'Unauthorized: User does not have permission to view invoices for workspace 00000000-0000-0000-0000-000000000001',
  'pending invoice row RPC inherits the view_invoices guard'
);

select throws_ok(
  $$ select public.get_pending_invoices_count(
    '00000000-0000-0000-0000-000000000001'::uuid
  ) $$,
  'P0001',
  'Unauthorized: User does not have permission to view invoices for workspace 00000000-0000-0000-0000-000000000001',
  'pending invoice count RPC inherits the view_invoices guard'
);

select throws_ok(
  $$ select * from public.get_pending_invoices_grouped_by_user(
    '00000000-0000-0000-0000-000000000001'::uuid
  ) $$,
  'P0001',
  'Unauthorized: User does not have permission to view invoices for workspace 00000000-0000-0000-0000-000000000001',
  'grouped pending invoice row RPC inherits the view_invoices guard'
);

select throws_ok(
  $$ select public.get_pending_invoices_grouped_by_user_count(
    '00000000-0000-0000-0000-000000000001'::uuid
  ) $$,
  'P0001',
  'Unauthorized: User does not have permission to view invoices for workspace 00000000-0000-0000-0000-000000000001',
  'grouped pending invoice count RPC inherits the view_invoices guard'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_pending_invoices(uuid,integer,integer,text,uuid[])',
    'execute'
  ),
  'anon cannot call pending invoice row RPC directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_pending_invoices_grouped_by_user(uuid,integer,integer,text,uuid[])',
    'execute'
  ),
  'anon cannot call grouped pending invoice row RPC directly'
);

select lives_ok(
  $$
    select set_config('request.jwt.claim.role', 'service_role', true);
    select * from public.get_pending_invoices_base(
      '00000000-0000-0000-0000-000000000001'::uuid,
      true
    );
  $$,
  'service-role server routes can call the pending invoice base RPC after route authorization'
);

select * from finish();

rollback;
