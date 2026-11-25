import 'package:mobile/data/repositories/workspace_permissions_repository.dart';

bool canManageInventoryCatalog(WorkspacePermissions permissions) {
  return permissions.containsPermission('manage_inventory_catalog') ||
      permissions.containsPermission('create_inventory') ||
      permissions.containsPermission('update_inventory') ||
      permissions.containsPermission('delete_inventory');
}

/// Mirrors when the products list API includes stock rows: view-stock, or
/// create-sales for the checkout picker.
bool canViewInventoryStock(WorkspacePermissions permissions) {
  return canReadInventoryStockDetail(permissions) ||
      canCreateInventorySales(permissions);
}

/// Mirrors the server's `canViewInventoryStock`, which gates stock on the
/// single-product read and the stock history; create-sales is not enough.
bool canReadInventoryStockDetail(WorkspacePermissions permissions) {
  return permissions.containsPermission('view_inventory_stock') ||
      permissions.containsPermission('view_stock_quantity') ||
      canAdjustInventoryStock(permissions);
}

/// Mirrors the server's `canAdjustInventoryStock`, required to send stock
/// rows when creating, editing or adjusting a product.
bool canAdjustInventoryStock(WorkspacePermissions permissions) {
  return permissions.containsPermission('adjust_inventory_stock') ||
      permissions.containsPermission('update_stock_quantity');
}

bool canManageInventorySetup(WorkspacePermissions permissions) {
  return permissions.containsPermission('manage_inventory_setup') ||
      permissions.containsPermission('create_inventory') ||
      permissions.containsPermission('update_inventory') ||
      permissions.containsPermission('delete_inventory');
}

bool canCreateInventorySales(WorkspacePermissions permissions) {
  return permissions.containsPermission('create_inventory_sales') ||
      permissions.containsPermission('create_invoices');
}

bool canUpdateInventorySales(WorkspacePermissions permissions) {
  return permissions.containsPermission('update_invoices');
}

bool canDeleteInventorySales(WorkspacePermissions permissions) {
  return permissions.containsPermission('delete_invoices');
}
