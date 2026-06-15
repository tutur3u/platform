-- Per-currency Polar checkout products.
--
-- The inventory checkout reuses a generic custom-amount ("pay what you want")
-- Polar product to charge the reserved cart total. A Polar product's price is
-- bound to a single currency, so a workspace that runs storefronts in more than
-- one currency (e.g. an AUD storefront) cannot share one USD product — Polar
-- rejects the checkout with "Product is not available in the specified currency".
--
-- This table maps each (workspace, environment, currency) to its own generic
-- checkout product so checkouts always reference a product priced in the
-- storefront's currency. Additive and private-schema only.

create table if not exists private.inventory_polar_checkout_products (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  -- Stored uppercase to match the rest of the inventory currency model; the
  -- Polar boundary lowercases it.
  currency text not null,
  polar_product_id text not null,
  polar_product_name text not null default 'Tuturuuu Inventory Checkout',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ws_id, environment, currency)
);
