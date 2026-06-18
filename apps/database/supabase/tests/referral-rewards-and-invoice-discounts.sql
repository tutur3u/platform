begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(12);

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-4000-8000-000000010001',
  'Referral reward test workspace',
  false,
  '00000000-0000-0000-0000-000000000001'
);

insert into public.workspace_users (id, ws_id, full_name, email)
values
  (
    '00000000-0000-4000-8000-000000010101',
    '00000000-0000-4000-8000-000000010001',
    'Referral referrer',
    'referrer@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000010102',
    '00000000-0000-4000-8000-000000010001',
    'Referral receiver',
    'receiver@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000010103',
    '00000000-0000-4000-8000-000000010001',
    'Referral extra receiver',
    'receiver-extra@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000010104',
    '00000000-0000-4000-8000-000000010001',
    'Referral actor',
    'actor@example.test'
  );

insert into public.product_categories (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000010201',
  'Referral test category',
  '00000000-0000-4000-8000-000000010001'
);

insert into private.inventory_owners (id, ws_id, name)
values (
  '00000000-0000-4000-8000-000000010301',
  '00000000-0000-4000-8000-000000010001',
  'Referral test owner'
);

insert into public.workspace_products (
  id,
  category_id,
  name,
  owner_id,
  ws_id
)
values (
  '00000000-0000-4000-8000-000000010401',
  '00000000-0000-4000-8000-000000010201',
  'Referral test product',
  '00000000-0000-4000-8000-000000010301',
  '00000000-0000-4000-8000-000000010001'
);

insert into private.inventory_units (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000010501',
  'Referral test unit',
  '00000000-0000-4000-8000-000000010001'
);

insert into private.inventory_warehouses (id, name, ws_id)
values (
  '00000000-0000-4000-8000-000000010601',
  'Referral test warehouse',
  '00000000-0000-4000-8000-000000010001'
);

insert into private.inventory_products (
  product_id,
  unit_id,
  warehouse_id,
  amount,
  price
)
values (
  '00000000-0000-4000-8000-000000010401',
  '00000000-0000-4000-8000-000000010501',
  '00000000-0000-4000-8000-000000010601',
  10,
  100
);

insert into private.workspace_promotions (
  id,
  ws_id,
  name,
  code,
  value,
  use_ratio
)
values (
  '00000000-0000-4000-8000-000000010701',
  '00000000-0000-4000-8000-000000010001',
  'Receiver reward',
  'RECEIVER',
  25,
  true
);

insert into public.workspace_settings (
  ws_id,
  referral_count_cap,
  referral_increment_percent,
  referral_reward_type,
  referral_promotion_id
)
values (
  '00000000-0000-4000-8000-000000010001',
  1,
  10,
  'BOTH'::public.referral_reward_type,
  '00000000-0000-4000-8000-000000010701'
);

select is(
  (
    select status
    from private.assign_workspace_user_referral(
      '00000000-0000-4000-8000-000000010001',
      '00000000-0000-4000-8000-000000010101',
      '00000000-0000-4000-8000-000000010102',
      '00000000-0000-4000-8000-000000010104'
    )
  ),
  'success',
  'assign referral succeeds'
);

select is(
  (
    select referred_by
    from public.workspace_users
    where id = '00000000-0000-4000-8000-000000010102'
  ),
  '00000000-0000-4000-8000-000000010101'::uuid,
  'receiver is linked to the referrer'
);

select ok(
  exists (
    select 1
    from private.workspace_promotions
    where ws_id = '00000000-0000-4000-8000-000000010001'
      and owner_id = '00000000-0000-4000-8000-000000010101'
      and promo_type = 'REFERRAL'::public.promotion_type
  ),
  'referrer-owned referral promotion is created'
);

select ok(
  exists (
    select 1
    from private.user_linked_promotions link
    join private.workspace_promotions promotion
      on promotion.id = link.promo_id
    where link.user_id = '00000000-0000-4000-8000-000000010101'
      and promotion.owner_id = '00000000-0000-4000-8000-000000010101'
      and promotion.promo_type = 'REFERRAL'::public.promotion_type
  ),
  'referral promotion remains linked to its owner'
);

select ok(
  exists (
    select 1
    from private.user_linked_promotions
    where user_id = '00000000-0000-4000-8000-000000010102'
      and promo_id = '00000000-0000-4000-8000-000000010701'
  ),
  'receiver reward promotion is linked to the receiver'
);

select is(
  (
    select status
    from private.assign_workspace_user_referral(
      '00000000-0000-4000-8000-000000010001',
      '00000000-0000-4000-8000-000000010101',
      '00000000-0000-4000-8000-000000010103',
      '00000000-0000-4000-8000-000000010104'
    )
  ),
  'success',
  'assignment allows referrals beyond the configured discount cap'
);

select is(
  (
    select discount_amount
    from private.calculate_invoice_values(
      '00000000-0000-4000-8000-000000010001',
      jsonb_build_array(
        jsonb_build_object(
          'product_id',
          '00000000-0000-4000-8000-000000010401',
          'unit_id',
          '00000000-0000-4000-8000-000000010501',
          'warehouse_id',
          '00000000-0000-4000-8000-000000010601',
          'quantity',
          1
        )
      ),
      (
        select id
        from private.workspace_promotions
        where owner_id = '00000000-0000-4000-8000-000000010101'
          and promo_type = 'REFERRAL'::public.promotion_type
      ),
      100,
      10,
      90,
      false
    )
  ),
  10::numeric,
  'invoice calculation applies capped dynamic referral discount amount'
);

select is(
  (
    select promotion_value
    from private.calculate_invoice_values(
      '00000000-0000-4000-8000-000000010001',
      jsonb_build_array(
        jsonb_build_object(
          'product_id',
          '00000000-0000-4000-8000-000000010401',
          'unit_id',
          '00000000-0000-4000-8000-000000010501',
          'warehouse_id',
          '00000000-0000-4000-8000-000000010601',
          'quantity',
          1
        )
      ),
      (
        select id
        from private.workspace_promotions
        where owner_id = '00000000-0000-4000-8000-000000010101'
          and promo_type = 'REFERRAL'::public.promotion_type
      ),
      100,
      10,
      90,
      true
    )
  ),
  10::numeric,
  'invoice calculation returns the dynamic referral percentage'
);

select is(
  (
    select promotion_use_ratio
    from private.calculate_invoice_values(
      '00000000-0000-4000-8000-000000010001',
      jsonb_build_array(
        jsonb_build_object(
          'product_id',
          '00000000-0000-4000-8000-000000010401',
          'unit_id',
          '00000000-0000-4000-8000-000000010501',
          'warehouse_id',
          '00000000-0000-4000-8000-000000010601',
          'quantity',
          1
        )
      ),
      (
        select id
        from private.workspace_promotions
        where owner_id = '00000000-0000-4000-8000-000000010101'
          and promo_type = 'REFERRAL'::public.promotion_type
      ),
      null,
      null,
      null,
      false
    )
  ),
  true,
  'invoice calculation treats referral promotions as percentage discounts'
);

select is(
  (
    select status
    from private.remove_workspace_user_referral(
      '00000000-0000-4000-8000-000000010001',
      '00000000-0000-4000-8000-000000010101',
      '00000000-0000-4000-8000-000000010102',
      '00000000-0000-4000-8000-000000010104'
    )
  ),
  'success',
  'remove referral succeeds'
);

select ok(
  (
    select referred_by is null
    from public.workspace_users
    where id = '00000000-0000-4000-8000-000000010102'
  ),
  'receiver referral link is removed'
);

select ok(
  not exists (
    select 1
    from private.user_linked_promotions
    where user_id = '00000000-0000-4000-8000-000000010102'
      and promo_id = '00000000-0000-4000-8000-000000010701'
  ),
  'receiver reward promotion is removed with the referral'
);

select * from finish();

rollback;
