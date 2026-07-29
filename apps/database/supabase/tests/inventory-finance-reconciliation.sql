begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(33);

insert into public.users (id, display_name)
values ('21000000-0000-4000-8000-000000000001', 'Reconciliation owner')
on conflict (id) do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values
  (
    '21000000-0000-4000-8000-000000000002',
    'Reconciliation workspace',
    '21000000-0000-4000-8000-000000000001',
    false
  ),
  (
    '21000000-0000-4000-8000-000000000003',
    'Other reconciliation workspace',
    '21000000-0000-4000-8000-000000000001',
    false
  )
on conflict (id) do nothing;

insert into private.workspace_wallets (id, name, currency, ws_id)
values
  (
    '21000000-0000-4000-8000-000000000010',
    'USD operating',
    'USD',
    '21000000-0000-4000-8000-000000000002'
  ),
  (
    '21000000-0000-4000-8000-000000000011',
    'USD clearing',
    'USD',
    '21000000-0000-4000-8000-000000000002'
  ),
  (
    '21000000-0000-4000-8000-000000000012',
    'VND operating',
    'VND',
    '21000000-0000-4000-8000-000000000002'
  ),
  (
    '21000000-0000-4000-8000-000000000013',
    'Other workspace USD',
    'USD',
    '21000000-0000-4000-8000-000000000003'
  );

insert into public.transaction_categories (id, name, is_expense, ws_id)
values
  (
    '21000000-0000-4000-8000-000000000020',
    'Provider revenue',
    false,
    '21000000-0000-4000-8000-000000000002'
  ),
  (
    '21000000-0000-4000-8000-000000000021',
    'Other category',
    false,
    '21000000-0000-4000-8000-000000000003'
  );

insert into private.inventory_storefronts (
  id, ws_id, slug, name, status, visibility, currency, checkout_mode
) values (
  '21000000-0000-4000-8000-000000000030',
  '21000000-0000-4000-8000-000000000002',
  'reconciliation-test',
  'Reconciliation test',
  'published',
  'public',
  'USD',
  'square_pos'
);

insert into private.inventory_checkout_sessions (
  id,
  ws_id,
  storefront_id,
  public_token,
  status,
  customer_name,
  customer_email,
  currency,
  subtotal_amount,
  total_amount,
  expires_at,
  completed_at,
  checkout_provider,
  square_payment_id
) values (
  '21000000-0000-4000-8000-000000000031',
  '21000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000030',
  'reconciliation-checkout',
  'completed',
  'Provider customer',
  'provider@example.test',
  'USD',
  10000,
  10000,
  now() + interval '15 minutes',
  '2026-07-01T00:00:00Z',
  'square_pos',
  'square-payment-1'
);

select ok(
  to_regclass('private.inventory_finance_entries') is not null
    and to_regclass('private.inventory_finance_provider_mappings') is not null,
  'reconciliation tables exist in private'
);

select has_function(
  'private',
  'get_inventory_finance_reconciliation_summary',
  array['uuid', 'timestamp with time zone', 'timestamp with time zone', 'uuid'],
  'wallet-scoped reconciliation summary RPC exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.get_inventory_finance_reconciliation_summary(uuid,timestamptz,timestamptz,uuid)',
    'execute'
  ),
  'authenticated clients cannot execute the private reconciliation summary'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_inventory_finance_reconciliation_summary(uuid,timestamptz,timestamptz,uuid)',
    'execute'
  ),
  'service role can execute the private reconciliation summary'
);

select lives_ok(
  $$
    select private.backfill_inventory_finance_sales(
      '21000000-0000-4000-8000-000000000002'
    )
  $$,
  'historical completed provider sales can be backfilled idempotently'
);

select is(
  (
    select reconciliation_status
    from private.inventory_finance_entries
    where source_key = 'sale:square-payment-1'
  ),
  'pending',
  'historical unmatched sales enter the inbox without a ledger transaction'
);

select ok(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'private.inventory_finance_entries'::regclass,
      'private.inventory_finance_provider_mappings'::regclass
    )
  ),
  'reconciliation tables have RLS enabled'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.inventory_finance_entries',
    'select'
  )
    and not has_table_privilege(
      'authenticated',
      'private.inventory_finance_provider_mappings',
      'select'
    ),
  'authenticated clients cannot read reconciliation tables directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.bulk_link_inventory_finance_entries(uuid,uuid[],uuid,uuid,uuid)',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'private.bulk_link_inventory_finance_entries(uuid,uuid[],uuid,uuid,uuid)',
      'execute'
    ),
  'only the service role can execute bulk linking'
);

select is(
  private.inventory_finance_minor_to_major(10000, 'USD'),
  100::numeric,
  'two-decimal provider amounts convert to major units'
);

select is(
  private.inventory_finance_minor_to_major(500, 'VND'),
  500::numeric,
  'zero-decimal provider amounts remain whole units'
);

select lives_ok(
  $$
    insert into private.inventory_finance_provider_mappings (
      ws_id, provider, currency, wallet_id, category_id
    ) values (
      '21000000-0000-4000-8000-000000000002',
      'square_pos',
      'USD',
      '21000000-0000-4000-8000-000000000010',
      '21000000-0000-4000-8000-000000000020'
    )
  $$,
  'provider and currency mapping accepts same-workspace defaults'
);

select throws_ok(
  $$
    insert into private.inventory_finance_provider_mappings (
      ws_id, provider, currency, wallet_id
    ) values (
      '21000000-0000-4000-8000-000000000002',
      'polar',
      'USD',
      '21000000-0000-4000-8000-000000000013'
    )
  $$,
  'P0001',
  'INVALID_INVENTORY_FINANCE_MAPPING_WALLET',
  'cross-workspace mapping wallets are rejected'
);

select throws_ok(
  $$
    insert into private.inventory_finance_provider_mappings (
      ws_id, provider, currency, wallet_id
    ) values (
      '21000000-0000-4000-8000-000000000002',
      'polar',
      'USD',
      '21000000-0000-4000-8000-000000000012'
    )
  $$,
  'P0001',
  'INVALID_INVENTORY_FINANCE_MAPPING_WALLET',
  'mapping wallets must match the provider currency'
);

select lives_ok(
  $$
    select private.upsert_inventory_finance_entry(
      '21000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000031',
      'square_pos',
      'sale',
      'sale:square-payment-1',
      'square-payment-1',
      10000,
      'USD',
      '2026-07-01T00:00:00Z',
      '21000000-0000-4000-8000-000000000010',
      '21000000-0000-4000-8000-000000000020'
    )
  $$,
  'sale entry and wallet transaction are created atomically'
);

select is(
  (
    select transaction.amount
    from public.wallet_transactions transaction
    join private.inventory_finance_entries entry
      on entry.wallet_transaction_id = transaction.id
    where entry.source_key = 'sale:square-payment-1'
  ),
  100::numeric,
  'linked sale posts the major-unit amount'
);

select is(
  (
    select checkout.finance_transaction_id
    from private.inventory_checkout_sessions checkout
    where checkout.id = '21000000-0000-4000-8000-000000000031'
  ),
  (
    select entry.wallet_transaction_id
    from private.inventory_finance_entries entry
    where entry.source_key = 'sale:square-payment-1'
  ),
  'legacy checkout transaction link is maintained'
);

select lives_ok(
  $$
    select private.upsert_inventory_finance_entry(
      '21000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000031',
      'square_pos',
      'sale',
      'sale:square-payment-1',
      'square-payment-1',
      11000,
      'USD',
      '2026-07-01T00:00:00Z',
      '21000000-0000-4000-8000-000000000010',
      '21000000-0000-4000-8000-000000000020'
    )
  $$,
  'provider webhook retries update the existing source entry'
);

select is(
  (
    select count(*)
    from private.inventory_finance_entries
    where source_key = 'sale:square-payment-1'
  ),
  1::bigint,
  'provider source keys are idempotent'
);

select is(
  (
    select transaction.amount
    from public.wallet_transactions transaction
    join private.inventory_finance_entries entry
      on entry.wallet_transaction_id = transaction.id
    where entry.source_key = 'sale:square-payment-1'
  ),
  110::numeric,
  'provider-controlled amount updates stay synchronized'
);

select lives_ok(
  $$
    select private.upsert_inventory_finance_entry(
      '21000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000031',
      'square_pos',
      'refund',
      'refund:square-refund-1',
      'square-refund-1',
      -2500,
      'USD',
      '2026-07-02T00:00:00Z',
      '21000000-0000-4000-8000-000000000010',
      '21000000-0000-4000-8000-000000000020',
      null,
      'completed',
      (
        select id from private.inventory_finance_entries
        where source_key = 'sale:square-payment-1'
      )
    )
  $$,
  'completed refunds create negative adjustments'
);

select is(
  (
    select transaction.amount
    from public.wallet_transactions transaction
    join private.inventory_finance_entries entry
      on entry.wallet_transaction_id = transaction.id
    where entry.source_key = 'refund:square-refund-1'
  ),
  (-25)::numeric,
  'refund adjustment is negative'
);

select lives_ok(
  $$
    select private.upsert_inventory_finance_entry(
      '21000000-0000-4000-8000-000000000002',
      null,
      'polar',
      'manual_provider_adjustment',
      'manual:test-pending',
      'polar-order-2',
      -700,
      'USD',
      '2026-07-03T00:00:00Z',
      null,
      '21000000-0000-4000-8000-000000000020',
      null,
      'completed',
      null,
      '{"reason":"provider-unavailable chargeback"}'::jsonb,
      null,
      false
    )
  $$,
  'manual provider adjustment can remain pending without ledger impact'
);

select is(
  (
    select reconciliation_status
    from private.inventory_finance_entries
    where source_key = 'manual:test-pending'
  ),
  'pending',
  'unlinked entries remain outside the ledger'
);

select lives_ok(
  $$
    select private.bulk_link_inventory_finance_entries(
      '21000000-0000-4000-8000-000000000002',
      array[
        (
          select id from private.inventory_finance_entries
          where source_key = 'manual:test-pending'
        )
      ],
      '21000000-0000-4000-8000-000000000010',
      null,
      null
    )
  $$,
  'bulk link assigns a pending entry'
);

select lives_ok(
  $$
    select private.bulk_link_inventory_finance_entries(
      '21000000-0000-4000-8000-000000000002',
      array[
        (
          select id from private.inventory_finance_entries
          where source_key = 'manual:test-pending'
        )
      ],
      '21000000-0000-4000-8000-000000000011',
      null,
      null
    )
  $$,
  'bulk link moves an existing linked entry atomically'
);

select is(
  (
    select transaction.wallet_id
    from public.wallet_transactions transaction
    join private.inventory_finance_entries entry
      on entry.wallet_transaction_id = transaction.id
    where entry.source_key = 'manual:test-pending'
  ),
  '21000000-0000-4000-8000-000000000011'::uuid,
  'bulk move updates the ordinary Finance transaction wallet'
);

select lives_ok(
  $$
    select private.upsert_inventory_finance_entry(
      '21000000-0000-4000-8000-000000000002',
      null,
      'polar',
      'manual_provider_adjustment',
      'manual:vnd-pending',
      'polar-order-vnd',
      -1000,
      'VND',
      '2026-07-04T00:00:00Z',
      null,
      null,
      null,
      'completed',
      null,
      '{}'::jsonb,
      null,
      false
    )
  $$,
  'a different-currency entry can wait in the inbox'
);

select throws_ok(
  $$
    select private.bulk_link_inventory_finance_entries(
      '21000000-0000-4000-8000-000000000002',
      array[
        (
          select id from private.inventory_finance_entries
          where source_key = 'manual:vnd-pending'
        )
      ],
      '21000000-0000-4000-8000-000000000010',
      null,
      null
    )
  $$,
  'P0001',
  'INVENTORY_FINANCE_WALLET_CURRENCY_MISMATCH',
  'bulk linking rejects cross-currency ledger corruption'
);

select lives_ok(
  $$
    select private.bulk_unlink_inventory_finance_entries(
      '21000000-0000-4000-8000-000000000002',
      array[
        (
          select id from private.inventory_finance_entries
          where source_key = 'manual:test-pending'
        )
      ],
      null
    )
  $$,
  'bulk unlink returns linked entries to pending'
);

select is(
  (
    select reconciliation_status
    from private.inventory_finance_entries
    where source_key = 'manual:test-pending'
  ),
  'pending',
  'unlink preserves the durable source record'
);

select lives_ok(
  $$
    delete from public.wallet_transactions
    where id = (
      select wallet_transaction_id
      from private.inventory_finance_entries
      where source_key = 'refund:square-refund-1'
    )
  $$,
  'ordinary transaction deletion is accepted for a provider source'
);

select is(
  (
    select reconciliation_status
    from private.inventory_finance_entries
    where source_key = 'refund:square-refund-1'
  ),
  'pending',
  'ordinary transaction deletion returns the source entry to pending'
);

select * from finish();

rollback;
