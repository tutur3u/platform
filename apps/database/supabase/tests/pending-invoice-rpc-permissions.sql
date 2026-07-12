create extension if not exists pgtap with schema extensions;

begin;

select plan(10);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_pending_invoices_base(uuid,boolean)',
    'execute'
  ),
  'authenticated clients cannot bypass the Finance API pending invoice guard'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_pending_invoices_base(uuid,boolean)',
    'execute'
  ),
  'anon cannot call the pending invoice base RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_pending_invoices_base(uuid,boolean)',
    'execute'
  ),
  'service-role Finance routes can call the pending invoice base RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_pending_invoices(uuid,integer,integer,text,uuid[])',
    'execute'
  ),
  'authenticated clients cannot call pending invoice rows directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_pending_invoices_count(uuid,text,uuid[])',
    'execute'
  ),
  'authenticated clients cannot call pending invoice counts directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_pending_invoices_grouped_by_user(uuid,integer,integer,text,uuid[])',
    'execute'
  ),
  'authenticated clients cannot call grouped pending invoice rows directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_pending_invoices_grouped_by_user_count(uuid,text,uuid[])',
    'execute'
  ),
  'authenticated clients cannot call grouped pending invoice counts directly'
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
    select * from public.get_pending_invoices_base(
      '00000000-0000-0000-0000-000000000001'::uuid,
      true
    );
  $$,
  'server-only pending invoice base RPC supplies its guarded service-role context'
);

select * from finish();

rollback;
