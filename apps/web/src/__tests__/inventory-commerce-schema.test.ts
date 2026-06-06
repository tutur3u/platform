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
const bundleRepositoryPath = resolve(
  repoRoot,
  'apps/web/src/lib/inventory/commerce/bundles.ts'
);
const publicStorefrontRepositoryPath = resolve(
  repoRoot,
  'apps/web/src/lib/inventory/commerce/public-storefront.ts'
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

  it('validates bundle component targets before replacing stored components', () => {
    const source = readFileSync(bundleRepositoryPath, 'utf8');
    const validationIndex = source.indexOf('await assertComponentTargets');
    const deleteIndex = source.indexOf(
      'delete from private.inventory_bundle_components'
    );

    expect(source).toContain('async function assertComponentTargets');
    expect(validationIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(-1);
    expect(validationIndex).toBeLessThan(deleteIndex);
    expect(source).toMatch(/and product\.ws_id = \$\{wsId\}/);
    expect(source).toMatch(/and unit\.ws_id = \$\{wsId\}/);
    expect(source).toMatch(/and warehouse\.ws_id = \$\{wsId\}/);
    expect(source).toContain('when stock.product_id is null then 0');
    expect(source).toContain(
      'throw new InvalidInventoryBundleComponentTargetError()'
    );
  });

  it('filters bundle component reads through same-workspace stock joins', () => {
    const bundleSource = readFileSync(bundleRepositoryPath, 'utf8');
    const publicStorefrontSource = readFileSync(
      publicStorefrontRepositoryPath,
      'utf8'
    );

    for (const source of [bundleSource, publicStorefrontSource]) {
      expect(source).toContain('join public.workspace_products product');
      expect(source).toMatch(/and product\.ws_id = \$\{wsId\}/);
      expect(source).toContain('join private.inventory_units unit');
      expect(source).toMatch(/and unit\.ws_id = \$\{wsId\}/);
      expect(source).toContain('join private.inventory_warehouses warehouse');
      expect(source).toMatch(/and warehouse\.ws_id = \$\{wsId\}/);
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
});
