begin;

select plan(9);

select ok(
  'MAX'::public.workspace_product_tier < 'ULTRA'::public.workspace_product_tier
    and 'ULTRA'::public.workspace_product_tier < 'ENTERPRISE'::public.workspace_product_tier,
  'new tiers have an explicit order before Enterprise'
);

select ok(
  not has_table_privilege('authenticated', 'private.workspace_subscription_product_prices', 'select'),
  'catalog price projection is private'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.sync_versioned_workspace_subscription_product(uuid,text,text,public.workspace_product_tier,text,boolean,timestamptz,uuid,bigint,uuid,bigint)',
    'execute'
  ),
  'authenticated callers cannot project provider prices'
);

select ok(
  exists (
    select 1 from public.ai_credit_plan_allocations
    where tier = 'MAX' and credits_per_seat = 750000 and not is_active
  ) and exists (
    select 1 from public.ai_credit_plan_allocations
    where tier = 'ULTRA' and credits_per_seat = 1600000 and not is_active
  ),
  'new credit allocations are staged inactive'
);

set local role service_role;

select lives_ok($sql$
  select public.sync_versioned_workspace_subscription_product(
    '8a6f629d-4639-4cf7-ae5b-aae83fd46749', 'Fixture Max', '', 'MAX', 'month', false,
    '2026-11-26T00:00:00Z', 'ca65d5b7-c49c-46f1-b013-ec7192f1e162', 10000,
    'f46bc9b6-6a9f-4452-b52b-2fc73435b466', 2499000
  )
$sql$, 'service role projects both currencies in one transaction');

select results_eq(
  $$select currency, amount_per_seat from private.workspace_subscription_product_prices
    where product_id = '8a6f629d-4639-4cf7-ae5b-aae83fd46749' and is_current
    order by currency$$,
  $$values ('usd'::text, 10000::bigint), ('vnd'::text, 2499000::bigint)$$,
  'each price retains its original currency and minor amount'
);

select lives_ok($sql$
  select public.sync_versioned_workspace_subscription_product(
    '8a6f629d-4639-4cf7-ae5b-aae83fd46749', 'Fixture Max', '', 'MAX', 'month', false,
    '2026-11-26T00:00:00Z', 'ca65d5b7-c49c-46f1-b013-ec7192f1e162', 10000,
    'f46bc9b6-6a9f-4452-b52b-2fc73435b466', 2499000
  )
$sql$, 'equal provider version and matching values are idempotent');

select throws_ok($sql$
  select public.sync_versioned_workspace_subscription_product(
    '8a6f629d-4639-4cf7-ae5b-aae83fd46749', 'Fixture Max', '', 'MAX', 'month', false,
    '2026-11-26T00:00:00Z', 'ca65d5b7-c49c-46f1-b013-ec7192f1e162', 10000,
    'f46bc9b6-6a9f-4452-b52b-2fc73435b466', 2499001
  )
$sql$, '22023', 'Conflicting workspace catalog events at one provider version',
  'an equal-version disagreement cannot overwrite a price');

select is(
  (select price_per_seat::bigint from private.workspace_subscription_products
   where id = '8a6f629d-4639-4cf7-ae5b-aae83fd46749'),
  10000::bigint,
  'legacy mirror preserves the USD amount only'
);

reset role;
select * from finish();
rollback;
