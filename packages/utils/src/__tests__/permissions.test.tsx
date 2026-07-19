import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT_WORKSPACE_ID } from '../constants';
import { permissions } from '../permissions';

describe('workspace permission catalog', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const repoRoot = process.cwd().endsWith('/packages/utils')
    ? resolve(process.cwd(), '../..')
    : process.cwd();
  const invoiceProductPermissionIds = [
    'adjust_inventory_stock',
    'create_inventory_sales',
    'manage_inventory_catalog',
    'manage_inventory_setup',
    'view_inventory_analytics',
    'view_inventory_audit_logs',
    'view_inventory_catalog',
    'view_inventory_dashboard',
    'view_inventory_sales',
    'view_inventory_stock',
  ];

  it('keeps workspace role forms scoped by default', () => {
    const permissionIds = permissions({
      wsId: workspaceId,
      user: null,
    }).map((permission) => permission.id);

    expect(permissionIds).toContain('admin');
    expect(permissionIds).not.toContain('view_infrastructure');
    expect(permissionIds).not.toContain('manage_infrastructure_stress_tests');
    expect(permissionIds).not.toContain('manage_internal_accounts');
    expect(permissionIds).not.toContain('manage_workspace_secrets');
  });

  it('exposes internal account management only in the root workspace', () => {
    const rootPermissionIds = permissions({
      wsId: ROOT_WORKSPACE_ID,
      user: null,
    }).map((permission) => permission.id);

    expect(rootPermissionIds).toContain('manage_internal_accounts');
  });

  it('keeps internal account permission translations in shared role editors', () => {
    for (const app of ['cms', 'infrastructure', 'inventory', 'web']) {
      for (const locale of ['en', 'vi']) {
        const messages = JSON.parse(
          readFileSync(
            resolve(repoRoot, `apps/${app}/messages/${locale}.json`),
            'utf8'
          )
        ) as { 'ws-roles': Record<string, string> };

        expect(
          messages['ws-roles'].manage_internal_accounts?.length
        ).toBeGreaterThan(0);
        expect(
          messages['ws-roles'].manage_internal_accounts_description?.length
        ).toBeGreaterThan(0);
      }
    }
  });

  it('exposes the full shared catalog for typed defaults', () => {
    const permissionIds = permissions({
      catalog: 'full',
      wsId: workspaceId,
      user: null,
    }).map((permission) => permission.id);

    expect(permissionIds).toContain('admin');
    expect(permissionIds).toContain('view_infrastructure');
    expect(permissionIds).toContain('manage_infrastructure_stress_tests');
    expect(permissionIds).toContain('manage_internal_accounts');
    expect(permissionIds).toContain('manage_external_migrations');
    expect(permissionIds).toContain('manage_workspace_secrets');
    expect(new Set(permissionIds).size).toBe(permissionIds.length);
  });

  it('exposes invoice product troubleshooting permissions in workspace roles', () => {
    const permissionIds = permissions({
      wsId: workspaceId,
      user: null,
    }).map((permission) => permission.id);

    for (const permissionId of invoiceProductPermissionIds) {
      expect(permissionIds).toContain(permissionId);
    }
  });

  it('keeps Finance app role translations for invoice product permissions', () => {
    const locales = ['en', 'vi'];

    for (const locale of locales) {
      const messages = JSON.parse(
        readFileSync(
          resolve(repoRoot, `apps/finance/messages/${locale}.json`),
          'utf8'
        )
      ) as { 'ws-roles': Record<string, string> };

      for (const permissionId of invoiceProductPermissionIds) {
        expect(messages['ws-roles'][permissionId]?.length).toBeGreaterThan(0);
        expect(
          messages['ws-roles'][`${permissionId}_description`]?.length
        ).toBeGreaterThan(0);
      }
    }
  });
});
