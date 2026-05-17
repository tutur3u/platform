import type { PermissionId } from '@tuturuuu/types';

export function getWorkspaceRoutePermissionRequirements(
  routeSegments: string[]
): PermissionId[] | null {
  const [section, subSection] = routeSegments;

  if (!section) {
    return null;
  }

  switch (section) {
    case 'ai':
    case 'datasets':
    case 'models':
    case 'pipelines':
      return ['ai_lab'];
    case 'ai-chat':
    case 'chat':
    case 'mira':
      return ['ai_chat'];
    case 'api-keys':
      return ['manage_api_keys'];
    case 'billing':
      return ['manage_subscription', 'manage_workspace_billing'];
    case 'calendar':
      return ['manage_calendar'];
    case 'documents':
      return ['manage_documents'];
    case 'drive':
      return ['view_drive', 'manage_drive'];
    case 'education':
      return [
        'view_user_groups',
        'view_user_groups_posts',
        'view_user_groups_reports',
      ];
    case 'epm':
    case 'external-projects':
      return ['manage_external_projects', 'publish_external_projects'];
    case 'forms':
      return subSection === 'new'
        ? ['manage_forms']
        : ['manage_forms', 'view_form_analytics'];
    case 'finance':
      if (subSection === 'invoices') {
        return ['view_invoices'];
      }
      if (subSection === 'transactions' || subSection === 'recurring') {
        return ['view_transactions'];
      }
      if (subSection === 'wallets') {
        return ['manage_finance', 'change_finance_wallets'];
      }
      return ['manage_finance', 'view_finance_stats'];
    case 'infrastructure':
      return ['view_infrastructure'];
    case 'integrations':
      return ['manage_workspace_integrations'];
    case 'inventory':
      if (subSection === 'analytics') {
        return ['view_inventory_analytics'];
      }
      if (subSection === 'products' || subSection === 'categories') {
        return ['view_inventory_catalog', 'manage_inventory_catalog'];
      }
      if (subSection === 'warehouses' || subSection === 'batches') {
        return ['view_inventory_stock', 'manage_inventory'];
      }
      return ['view_inventory', 'manage_inventory'];
    case 'mail':
      return ['send_user_group_post_emails'];
    case 'members':
      return ['manage_workspace_members'];
    case 'migrations':
      return ['manage_external_migrations'];
    case 'posts':
      return [
        'view_user_groups_posts',
        'create_user_groups_posts',
        'update_user_groups_posts',
      ];
    case 'roles':
      return ['manage_workspace_roles'];
    case 'secrets':
      return ['manage_workspace_secrets'];
    case 'settings':
      return ['manage_workspace_settings'];
    case 'tasks':
      return ['manage_projects'];
    case 'time-tracker':
      if (subSection === 'requests' || subSection === 'management') {
        return ['manage_time_tracking_requests'];
      }
      return [
        'manage_time_tracking_requests',
        'bypass_time_tracking_request_approval',
      ];
    case 'usage':
      return ['manage_workspace_members'];
    case 'users':
      if (subSection === 'groups') {
        return [
          'view_user_groups',
          'create_user_groups',
          'update_user_groups',
          'delete_user_groups',
        ];
      }
      if (subSection === 'reports') {
        return ['view_user_groups_reports', 'approve_reports'];
      }
      if (subSection === 'approvals') {
        return ['approve_reports', 'approve_posts'];
      }
      if (subSection === 'attendance') {
        return ['check_user_attendance', 'update_user_attendance'];
      }
      return [
        'manage_users',
        'view_users_public_info',
        'view_users_private_info',
      ];
    case 'workforce':
      return ['view_workforce', 'manage_workforce'];
    default:
      return null;
  }
}

export function hasRequiredWorkspaceRoutePermission({
  grantedPermissions,
  requiredPermissions,
}: {
  grantedPermissions: PermissionId[];
  requiredPermissions: PermissionId[];
}) {
  if (requiredPermissions.length === 0) {
    return false;
  }

  if (grantedPermissions.includes('admin')) {
    return true;
  }

  return requiredPermissions.some((permission) =>
    grantedPermissions.includes(permission)
  );
}
