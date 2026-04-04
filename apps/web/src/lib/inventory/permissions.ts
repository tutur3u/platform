import type { PermissionId } from '@tuturuuu/types';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';

const hasAnyPermission = (
  permissions: Pick<PermissionsResult, 'containsPermission'>,
  values: readonly PermissionId[]
) => values.some((value) => permissions.containsPermission(value));

export function canViewInventoryDashboard(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, [
    'view_inventory_dashboard',
    'view_inventory',
  ]);
}

export function canViewInventoryCatalog(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, [
    'view_inventory_catalog',
    'manage_inventory_catalog',
    'view_inventory',
    'create_inventory',
    'update_inventory',
    'delete_inventory',
  ]);
}

export function canManageInventoryCatalog(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, [
    'manage_inventory_catalog',
    'create_inventory',
    'update_inventory',
    'delete_inventory',
  ]);
}

export function canViewInventoryStock(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, [
    'view_inventory_stock',
    'view_stock_quantity',
    'adjust_inventory_stock',
    'update_stock_quantity',
  ]);
}

export function canAdjustInventoryStock(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, [
    'adjust_inventory_stock',
    'update_stock_quantity',
  ]);
}

export function canManageInventorySetup(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, [
    'manage_inventory_setup',
    'create_inventory',
    'update_inventory',
    'delete_inventory',
  ]);
}

export function canViewInventorySales(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, [
    'view_inventory_sales',
    'view_invoices',
  ]);
}

export function canCreateInventorySales(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, [
    'create_inventory_sales',
    'create_invoices',
  ]);
}

export function canUpdateInventorySales(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, ['update_invoices']);
}

export function canDeleteInventorySales(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, ['delete_invoices']);
}

export function canViewInventoryAnalytics(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, [
    'view_inventory_analytics',
    'view_inventory_dashboard',
    'view_inventory',
    'view_finance_stats',
  ]);
}

export function canViewInventoryAuditLogs(
  permissions: Pick<PermissionsResult, 'containsPermission'>
) {
  return hasAnyPermission(permissions, [
    'admin',
    'view_inventory_audit_logs',
    'manage_inventory_setup',
    'manage_inventory_catalog',
    'view_inventory',
    'create_inventory',
    'update_inventory',
    'delete_inventory',
    'manage_workspace_audit_logs',
  ]);
}
