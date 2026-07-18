begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(13);

select ok(
  public.inventory_cent_level_prices_ready(),
  'capability probe confirms exact decimal inventory price storage'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.inventory_cent_level_prices_ready()',
    'execute'
  ),
  'anon cannot execute the inventory price capability probe'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.inventory_cent_level_prices_ready()',
    'execute'
  ),
  'authenticated cannot execute the inventory price capability probe'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.inventory_cent_level_prices_ready()',
    'execute'
  ),
  'service_role can execute the inventory price capability probe'
);

select col_type_is(
  'private',
  'inventory_products',
  'price',
  'numeric(30,6)',
  'inventory product prices support exact sub-unit values'
);

select col_type_is(
  'private',
  'inventory_batches',
  'price',
  'numeric(30,6)',
  'inventory batch prices support exact sub-unit values'
);

select col_type_is(
  'private',
  'inventory_batches',
  'total_diff',
  'numeric(30,6)',
  'inventory batch adjustments support exact sub-unit values'
);

select col_type_is(
  'private',
  'inventory_batch_products',
  'price',
  'numeric(30,6)',
  'inventory batch product prices support exact sub-unit values'
);

select col_type_is(
  'public',
  'finance_invoice_products',
  'price',
  'numeric(30,6)',
  'invoice line prices preserve cent-level inventory prices'
);

select col_type_is(
  'public',
  'finance_invoice_products',
  'total_diff',
  'numeric(30,6)',
  'invoice line adjustments preserve sub-unit values'
);

select col_type_is(
  'public',
  'finance_invoices',
  'price',
  'numeric(30,6)',
  'invoice totals preserve sub-unit values'
);

select col_type_is(
  'public',
  'finance_invoices',
  'paid_amount',
  'numeric(30,6)',
  'invoice paid amounts preserve sub-unit values'
);

select col_type_is(
  'public',
  'finance_invoices',
  'total_diff',
  'numeric(30,6)',
  'invoice total adjustments preserve sub-unit values'
);

select * from finish();

rollback;
