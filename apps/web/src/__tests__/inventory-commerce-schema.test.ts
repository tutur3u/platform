import { readFileSync } from 'node:fs';
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
      expect(source).toContain('join public.inventory_units unit');
      expect(source).toMatch(/and unit\.ws_id = \$\{wsId\}/);
      expect(source).toContain('join public.inventory_warehouses warehouse');
      expect(source).toMatch(/and warehouse\.ws_id = \$\{wsId\}/);
      expect(source).toContain('join public.inventory_products stock');
    }
  });
});
