import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd().endsWith('/apps/web')
  ? resolve(process.cwd(), '../..')
  : process.cwd();

const migrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260519183024_add_inventory_commerce.sql'
);
const bundleScopeMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260519234500_harden_inventory_bundle_component_scope.sql'
);
const checkoutScopeMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260519234600_harden_inventory_checkout_bundle_scope.sql'
);
const inventoryPrivateMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260528141100_move_inventory_tables_private.sql'
);
const invoicePrivateRpcRepairMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260529182005_repair_private_invoice_value_rpc.sql'
);
const pendingInvoicePrivateInventoryMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260601101948_fix_pending_invoice_private_inventory.sql'
);
const pendingInvoiceRpcPermissionMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260602173706_harden_pending_invoice_rpcs.sql'
);
const pendingInvoicePaidCoverageMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260606092544_subscription_invoice_paid_coverage.sql'
);
const pendingInvoiceValidUntilCoverageMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260608085024_subscription_invoice_valid_until_coverage.sql'
);
const inventoryPolarMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260610163000_inventory_storefront_polar.sql'
);
const publicStorefrontPrivateRpcMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260611111500_inventory_public_storefront_private_rpcs.sql'
);
const inventoryOperatorPrivateRpcMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260612003400_inventory_operator_private_rpcs.sql'
);
const inventoryPolarWebhookWorkspaceBindingMigrationPath = resolve(
  repoRoot,
  'apps/database/supabase/migrations/20260622133112_harden_inventory_polar_webhook_workspace_binding.sql'
);

describe('inventory commerce migration contract', () => {
  it('creates storefront, bundle, checkout, reservation, and settlement tables', () => {
    const source = readFileSync(migrationPath, 'utf8');

    for (const table of [
      'inventory_storefronts',
      'inventory_storefront_listings',
      'inventory_bundles',
      'inventory_bundle_components',
      'inventory_checkout_sessions',
      'inventory_checkout_lines',
      'inventory_reservations',
      'inventory_settlement_ledger_entries',
    ]) {
      expect(source).toContain(`create table if not exists private.${table}`);
      expect(source).not.toContain(
        `create table if not exists public.${table}`
      );
      expect(source).toContain(
        `alter table private.${table} enable row level security`
      );
      expect(source).toContain(
        `grant all on table private.${table} to service_role`
      );
    }
  });

  it('defines atomic reservation and completion RPCs with service-role-only execution', () => {
    const source = readFileSync(migrationPath, 'utf8');

    for (const functionName of [
      'create_inventory_checkout_session',
      'release_inventory_checkout_session',
      'complete_inventory_checkout_session',
    ]) {
      expect(source).toContain(
        `create or replace function public.${functionName}`
      );
      expect(source).toContain(`revoke all on function public.${functionName}`);
      expect(source).toContain(
        `grant execute on function public.${functionName}`
      );
    }
  });

  it('adds storefront visibility and private Polar checkout configuration', () => {
    const source = readFileSync(inventoryPolarMigrationPath, 'utf8');

    expect(source).toContain('alter table private.inventory_storefronts');
    expect(source).toContain('visibility text not null default');
    expect(source).toContain('inventory_storefronts_visibility_check');
    expect(source).toContain(
      'create table if not exists private.inventory_polar_integrations'
    );
    expect(source).toContain(
      'create table if not exists private.inventory_polar_settings'
    );
    expect(source).toContain('access_token_encrypted text not null');
    expect(source).not.toContain('access_token text');
    expect(source).toContain(
      'alter table private.inventory_polar_integrations enable row level security'
    );
    expect(source).toContain(
      'alter table private.inventory_polar_settings enable row level security'
    );
    expect(source).toContain(
      'revoke all on table private.inventory_polar_integrations'
    );
    expect(source).toContain(
      'grant all on table private.inventory_polar_integrations to service_role'
    );
    expect(source).toContain('complete_inventory_checkout_session_payment');
    expect(source).toContain('polar_checkout_id');
    expect(source).toContain('polar_order_id');
  });

  it('requires workspace scope for Polar checkout release and payment RPCs', () => {
    expect(existsSync(inventoryPolarWebhookWorkspaceBindingMigrationPath)).toBe(
      true
    );

    const source = readFileSync(
      inventoryPolarWebhookWorkspaceBindingMigrationPath,
      'utf8'
    );

    expect(source).toContain(
      'drop function if exists public.release_inventory_checkout_session'
    );
    expect(source).toContain(
      'drop function if exists public.complete_inventory_checkout_session_payment'
    );
    expect(source).toContain(
      'create or replace function public.release_inventory_checkout_session'
    );
    expect(source).toContain('p_ws_id uuid');
    expect(source).toContain(
      'where id = p_checkout_id\n    and ws_id = p_ws_id'
    );
    expect(source).toContain(
      'create or replace function private.release_inventory_checkout_session'
    );
    expect(source).toContain('p_ws_id := p_ws_id');
    expect(source).toContain(
      'create or replace function private.complete_inventory_checkout_session_payment'
    );
    expect(source).toContain(
      'grant execute on function private.complete_inventory_checkout_session_payment'
    );
  });

  it('hardens bundle components and checkout reservations by workspace scope', () => {
    const componentSource = readFileSync(bundleScopeMigrationPath, 'utf8');
    const checkoutSource = readFileSync(checkoutScopeMigrationPath, 'utf8');

    expect(componentSource).toContain(
      'create or replace function private.assert_inventory_bundle_component_scope()'
    );
    expect(componentSource).toContain(
      'create trigger inventory_bundle_components_scope'
    );
    expect(componentSource).toContain(
      'delete from private.inventory_bundle_components component'
    );
    expect(componentSource).toContain('product.ws_id = bundle_workspace_id');
    expect(componentSource).toContain('and unit.ws_id = bundle_workspace_id');
    expect(componentSource).toContain(
      'and warehouse.ws_id = bundle_workspace_id'
    );
    expect(componentSource).toContain('p_ws_id uuid');
    expect(componentSource).toContain('and product.ws_id = p_ws_id');
    expect(componentSource).toContain('and unit.ws_id = p_ws_id');
    expect(componentSource).toContain('and warehouse.ws_id = p_ws_id');
    expect(checkoutSource).toContain(
      'drop function if exists public._inventory_create_reserved_line'
    );
    expect(checkoutSource).toContain('BUNDLE_COMPONENTS_REQUIRED');
  });

  it('validates bundle component targets inside the atomic private upsert RPC', () => {
    const source = readFileSync(
      inventoryOperatorPrivateRpcMigrationPath,
      'utf8'
    );
    const validationIndex = source.indexOf(
      'INVALID_BUNDLE_COMPONENT_WORKSPACE_SCOPE'
    );
    const deleteIndex = source.indexOf(
      'delete from private.inventory_bundle_components'
    );

    expect(source).toContain(
      'create or replace function private.upsert_inventory_bundle_with_components'
    );
    expect(validationIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(-1);
    expect(source).toContain('join public.workspace_products product');
    expect(source).toContain('and product.ws_id = p_ws_id');
    expect(source).toContain('and unit.ws_id = p_ws_id');
    expect(source).toContain('and warehouse.ws_id = p_ws_id');
    expect(source).toContain('when stock.product_id is null then 0');
    expect(source).toContain('raise exception');
  });

  it('filters bundle component reads through same-workspace stock joins', () => {
    const bundleSource = readFileSync(
      inventoryOperatorPrivateRpcMigrationPath,
      'utf8'
    );
    const publicStorefrontRpcSource = readFileSync(
      publicStorefrontPrivateRpcMigrationPath,
      'utf8'
    );

    expect(bundleSource).toContain(
      'create or replace function private.list_inventory_bundles'
    );
    expect(bundleSource).toContain('join public.workspace_products product');
    expect(bundleSource).toContain('and product.ws_id = p_ws_id');
    expect(bundleSource).toContain('join private.inventory_units unit');
    expect(bundleSource).toContain('and unit.ws_id = p_ws_id');
    expect(bundleSource).toContain(
      'join private.inventory_warehouses warehouse'
    );
    expect(bundleSource).toContain('and warehouse.ws_id = p_ws_id');
    expect(bundleSource).toContain('join private.inventory_products stock');

    expect(publicStorefrontRpcSource).toContain(
      'create or replace function private.get_public_inventory_storefront'
    );
    for (const tableAlias of ['product', 'unit', 'warehouse']) {
      expect(publicStorefrontRpcSource).toContain(
        `and ${tableAlias}.ws_id = storefront.ws_id`
      );
    }
    for (const source of [publicStorefrontRpcSource]) {
      expect(source).toContain('join public.workspace_products product');
      expect(source).toContain('join private.inventory_units unit');
      expect(source).toContain('join private.inventory_warehouses warehouse');
      expect(source).toContain('join private.inventory_products stock');
    }
  });

  it('moves core inventory stock tables to the private schema', () => {
    const source = readFileSync(inventoryPrivateMigrationPath, 'utf8');

    for (const table of [
      'inventory_products',
      'inventory_suppliers',
      'inventory_units',
      'inventory_warehouses',
      'inventory_batches',
      'inventory_batch_products',
      'inventory_owners',
      'inventory_audit_logs',
      'inventory_manufacturers',
    ]) {
      expect(source).toContain(`'${table}'`);
      expect(source).toContain(
        `alter table if exists private.${table} enable row level security`
      );
      expect(source).toContain(`private.${table}`);
    }

    expect(source).toContain('grant all on table');
    expect(source).toContain('to service_role');
    expect(source).toContain(
      "execute format('alter table public.%I set schema private'"
    );
    expect(source).toContain('private.inventory_products inventory');
  });

  it('repairs private invoice value calculation metadata after inventory table moves', () => {
    expect(existsSync(invoicePrivateRpcRepairMigrationPath)).toBe(true);

    const source = readFileSync(invoicePrivateRpcRepairMigrationPath, 'utf8');

    expect(source).toContain(
      'create or replace function private.calculate_invoice_values'
    );
    expect(source).toContain('join private.inventory_products inventory');
    expect(source).not.toContain('join public.inventory_products inventory');
    expect(source).toContain(
      'revoke all on function private.calculate_invoice_values'
    );
    expect(source).toContain(
      'grant execute on function private.calculate_invoice_values'
    );
    expect(source).toContain("notify pgrst, 'reload schema'");
  });

  it('repairs pending invoice RPC inventory joins after inventory table moves', () => {
    expect(existsSync(pendingInvoicePrivateInventoryMigrationPath)).toBe(true);

    const source = readFileSync(
      pendingInvoicePrivateInventoryMigrationPath,
      'utf8'
    );
    const functionDeclarations =
      source.match(/create or replace function public\./g) ?? [];
    const privateInventoryJoins =
      source.match(/left join private\.inventory_products ip/g) ?? [];

    expect(functionDeclarations).toHaveLength(2);
    expect(source).toContain(
      'create or replace function public.get_pending_invoices'
    );
    expect(source).toContain(
      'create or replace function public.get_pending_invoices_grouped_by_user'
    );
    expect(privateInventoryJoins).toHaveLength(2);
    expect(source).not.toContain('left join inventory_products ip');
    expect(source).toContain("notify pgrst, 'reload schema'");
  });

  it('requires invoice view permission inside public pending invoice RPCs', () => {
    expect(existsSync(pendingInvoiceRpcPermissionMigrationPath)).toBe(true);

    const source = readFileSync(
      pendingInvoiceRpcPermissionMigrationPath,
      'utf8'
    );

    expect(source).toContain(
      'create or replace function public.get_pending_invoices_base'
    );
    expect(source).toContain(
      "public.has_workspace_permission(\n      p_ws_id,\n      auth.uid(),\n      'view_invoices'\n    )"
    );

    for (const signature of [
      'public.get_pending_invoices_base(uuid, boolean)',
      'public.get_pending_invoices(uuid, integer, integer, text, uuid[])',
      'public.get_pending_invoices_count(uuid, text, uuid[])',
      'public.get_pending_invoices_grouped_by_user(uuid, integer, integer, text, uuid[])',
      'public.get_pending_invoices_grouped_by_user_count(uuid, text, uuid[])',
    ]) {
      expect(source).toContain(`revoke all on function ${signature}`);
      expect(source).toContain(`grant execute on function ${signature}`);
    }

    expect(source).toContain("notify pgrst, 'reload schema'");
  });

  it('uses only completed invoices as pending invoice paid coverage', () => {
    expect(existsSync(pendingInvoicePaidCoverageMigrationPath)).toBe(true);

    const source = readFileSync(
      pendingInvoicePaidCoverageMigrationPath,
      'utf8'
    );

    expect(source).toContain(
      'create or replace function public.get_pending_invoices_base'
    );
    expect(source).toContain('and fi.completed_at is not null');
    expect(source).toContain(
      'revoke all on function public.get_pending_invoices_base'
    );
    expect(source).toContain(
      'grant execute on function public.get_pending_invoices_base'
    );
    expect(source).toContain("notify pgrst, 'reload schema'");
  });

  it('uses furthest valid_until as pending invoice paid coverage', () => {
    expect(existsSync(pendingInvoiceValidUntilCoverageMigrationPath)).toBe(
      true
    );

    const source = readFileSync(
      pendingInvoiceValidUntilCoverageMigrationPath,
      'utf8'
    );

    expect(source).toContain(
      'create or replace function public.get_pending_invoices_base'
    );
    expect(source).toContain('and fi.completed_at is not null');
    expect(source).toContain('fi.valid_until desc');
    expect(source).toContain('fi.created_at desc');
    expect(source).toContain(
      'revoke all on function public.get_pending_invoices_base'
    );
    expect(source).toContain(
      'grant execute on function public.get_pending_invoices_base'
    );
    expect(source).toContain("notify pgrst, 'reload schema'");
  });
});
