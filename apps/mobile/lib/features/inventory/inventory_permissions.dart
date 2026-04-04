import 'package:mobile/data/repositories/workspace_permissions_repository.dart';

bool canManageInventoryCatalog(WorkspacePermissions permissions) {
  return permissions.containsPermission('manage_inventory_catalog') ||
      permissions.containsPermission('create_inventory') ||
      permissions.containsPermission('update_inventory') ||
      permissions.containsPermission('delete_inventory');
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
