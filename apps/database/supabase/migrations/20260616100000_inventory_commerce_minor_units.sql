-- Migrate inventory commerce money columns from whole major units (dollars)
-- to integer minor units (the currency's smallest unit: cents for USD/EUR,
-- whole units for zero-decimal currencies like JPY/VND).
--
-- Why: the Polar product/bundle/checkout sync sends these amounts to Polar as
-- minor units, but the columns were populated as whole major units, so a $100
-- listing reached Polar as 100 cents = $1 (off by 100x). Storing minor units
-- canonically fixes the Polar boundary by construction and lets storefronts
-- price with sub-unit precision (e.g. $9.99).
--
-- This is a one-time, currency-aware backfill: each amount is multiplied by the
-- minor-unit factor of its row's currency (USD -> 100, JPY/VND -> 1). Only the
-- private inventory-commerce tables are migrated; shared tables
-- (workspace_promotions, inventory_products, finance wallets) keep their
-- existing conventions.

-- Minor-unit factor per currency. Matches the runtime helper
-- (`@tuturuuu/utils/money` -> getMinorUnitFactor), which uses Intl: among the
-- platform's supported currencies only JPY/KRW/VND are zero-decimal; everything
-- else is two-decimal. Unknown codes default to 100.
create or replace function private.inventory_currency_minor_factor(
  p_currency text
) returns numeric
language sql
immutable
as $$
  select case upper(coalesce(p_currency, 'USD'))
    when 'JPY' then 1
    when 'KRW' then 1
    when 'VND' then 1
    else 100
  end::numeric;
$$;

-- Listings: currency comes from the owning storefront (storefront_id NOT NULL).
update private.inventory_storefront_listings as l
set
  price = (l.price * private.inventory_currency_minor_factor(s.currency))::bigint,
  compare_at_price = case
    when l.compare_at_price is null then null
    else (
      l.compare_at_price * private.inventory_currency_minor_factor(s.currency)
    )::bigint
  end
from private.inventory_storefronts as s
where l.storefront_id = s.id;

-- Bundles: currency from the storefront when attached, else USD (default 100).
update private.inventory_bundles as b
set price = (
  b.price * private.inventory_currency_minor_factor(
    coalesce(
      (
        select s.currency
        from private.inventory_storefronts as s
        where s.id = b.storefront_id
      ),
      'USD'
    )
  )
)::bigint;

-- Checkout sessions: each session carries its own currency.
update private.inventory_checkout_sessions as cs
set
  subtotal_amount = (cs.subtotal_amount
    * private.inventory_currency_minor_factor(cs.currency))::bigint,
  discount_amount = (cs.discount_amount
    * private.inventory_currency_minor_factor(cs.currency))::bigint,
  platform_fee_amount = (cs.platform_fee_amount
    * private.inventory_currency_minor_factor(cs.currency))::bigint,
  processing_fee_estimate_amount = (cs.processing_fee_estimate_amount
    * private.inventory_currency_minor_factor(cs.currency))::bigint,
  conversion_fee_estimate_amount = (cs.conversion_fee_estimate_amount
    * private.inventory_currency_minor_factor(cs.currency))::bigint,
  total_amount = (cs.total_amount
    * private.inventory_currency_minor_factor(cs.currency))::bigint;

-- Checkout lines: currency from the parent session.
update private.inventory_checkout_lines as cl
set
  unit_price = (cl.unit_price
    * private.inventory_currency_minor_factor(cs.currency))::bigint,
  subtotal_amount = (cl.subtotal_amount
    * private.inventory_currency_minor_factor(cs.currency))::bigint
from private.inventory_checkout_sessions as cs
where cl.checkout_session_id = cs.id;

-- Settlement ledger entries carry their own currency.
update private.inventory_settlement_ledger_entries as le
set amount = (le.amount
  * private.inventory_currency_minor_factor(le.currency))::bigint;

-- Note: costing tables (inventory_cost_profiles / inventory_cost_scenarios)
-- intentionally stay in MAJOR units. Costing is a decimal estimation domain
-- that never reaches Polar; it only meets minor-unit money in the P&L view,
-- which converts cost to minor units at that single boundary
-- (apps/web .../inventory/commerce — operator P&L).

-- Document the unit on the migrated money columns.
comment on column private.inventory_storefront_listings.price is
  'Price in integer minor units of the storefront currency (cents for USD).';
comment on column private.inventory_storefront_listings.compare_at_price is
  'Compare-at price in integer minor units of the storefront currency.';
comment on column private.inventory_bundles.price is
  'Price in integer minor units of the bundle/storefront currency (cents for USD).';
comment on column private.inventory_checkout_sessions.total_amount is
  'Total in integer minor units of the session currency (cents for USD).';
comment on column private.inventory_checkout_lines.unit_price is
  'Unit price in integer minor units of the session currency (cents for USD).';
