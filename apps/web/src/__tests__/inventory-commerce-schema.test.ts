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
});
