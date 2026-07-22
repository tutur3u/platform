import { describe, expect, it, vi } from 'vitest';
import {
  canCreateInventorySetup,
  canDeleteInventorySetup,
  canInitiateInventoryPosCheckout,
  canUpdateInventorySetup,
  canViewInventoryAuditLogs,
} from './permissions';

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn(
      (permission: string) =>
        granted.includes('admin') || granted.includes(permission)
    ),
  };
}

describe('inventory setup permissions', () => {
  it('keeps setup create/update/delete boundaries independent', () => {
    const createOnly = permissionsWith(['create_inventory']);
    const updateOnly = permissionsWith(['update_inventory']);
    const deleteOnly = permissionsWith(['delete_inventory']);
    const setupManager = permissionsWith(['manage_inventory_setup']);

    expect(canCreateInventorySetup(createOnly)).toBe(true);
    expect(canUpdateInventorySetup(createOnly)).toBe(false);
    expect(canDeleteInventorySetup(createOnly)).toBe(false);

    expect(canCreateInventorySetup(updateOnly)).toBe(false);
    expect(
      canCreateInventorySetup(updateOnly, { allowUpdateInventory: true })
    ).toBe(true);
    expect(canUpdateInventorySetup(updateOnly)).toBe(true);
    expect(canDeleteInventorySetup(updateOnly)).toBe(false);

    expect(canCreateInventorySetup(deleteOnly)).toBe(false);
    expect(canUpdateInventorySetup(deleteOnly)).toBe(false);
    expect(canDeleteInventorySetup(deleteOnly)).toBe(true);

    expect(canCreateInventorySetup(setupManager)).toBe(true);
    expect(canUpdateInventorySetup(setupManager)).toBe(true);
    expect(canDeleteInventorySetup(setupManager)).toBe(true);
  });
});

describe('inventory audit log permissions', () => {
  it('requires dedicated audit-log permissions', () => {
    for (const broadPermission of [
      'view_inventory',
      'create_inventory',
      'update_inventory',
      'delete_inventory',
      'manage_inventory_setup',
      'manage_inventory_catalog',
    ]) {
      expect(
        canViewInventoryAuditLogs(permissionsWith([broadPermission]))
      ).toBe(false);
    }

    expect(
      canViewInventoryAuditLogs(permissionsWith(['view_inventory_audit_logs']))
    ).toBe(true);
    expect(
      canViewInventoryAuditLogs(
        permissionsWith(['manage_workspace_audit_logs'])
      )
    ).toBe(true);
    expect(canViewInventoryAuditLogs(permissionsWith(['admin']))).toBe(true);
  });
});

describe('inventory POS checkout permissions', () => {
  it('requires the dedicated POS permission or administrator access', () => {
    for (const broadPermission of [
      'view_inventory',
      'create_inventory',
      'update_inventory',
      'manage_inventory_catalog',
      'manage_inventory_setup',
      'manage_workspace_members',
    ]) {
      expect(
        canInitiateInventoryPosCheckout(permissionsWith([broadPermission]))
      ).toBe(false);
    }

    expect(
      canInitiateInventoryPosCheckout(
        permissionsWith(['initiate_pos_checkout'])
      )
    ).toBe(true);
    expect(canInitiateInventoryPosCheckout(permissionsWith(['admin']))).toBe(
      true
    );
  });
});
