import {
  ATTENDANCE_COUNT_MANAGERS_CONFIG_ID,
  ATTENDANCE_SHOW_MANAGERS_CONFIG_ID,
  DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  ENABLE_FEEDBACKS_CONFIG_ID,
  ENABLE_TUTORING_CONFIG_ID,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_CONFIG_IDS,
} from '@tuturuuu/internal-api/workspace-configs';
import { availableConfigs } from '@tuturuuu/utils/configs/reports';

export const CONTACTS_USER_MANAGEMENT_CONFIG_IDS = new Set([
  ATTENDANCE_COUNT_MANAGERS_CONFIG_ID,
  ATTENDANCE_SHOW_MANAGERS_CONFIG_ID,
  DATABASE_AUTO_ADD_NEW_GROUPS_TO_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS',
]);

export const CONTACTS_USER_STATUS_CONFIG_IDS = new Set(['user_status_labels']);

/**
 * Feature toggles the Contacts surface reads to decide whether a module is
 * available. Anyone who can see the module may read its toggle so the page can
 * render an explanation instead of a 404; flipping it still requires
 * `manage_workspace_settings` in the route's write check.
 */
export const CONTACTS_FEATURE_TOGGLE_CONFIG_IDS = new Set<string>([
  ENABLE_FEEDBACKS_CONFIG_ID,
  ENABLE_TUTORING_CONFIG_ID,
]);

export const CONTACTS_REPORT_CONFIG_IDS = new Set(
  availableConfigs
    .map((config) => config.id)
    .filter((id): id is string => Boolean(id))
);

export const CONTACTS_PROFILE_LINK_CONFIG_IDS = new Set<string>(
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_CONFIG_IDS
);

export function areContactsConfigIdsAllowed(
  ids: string[],
  permissions: Awaited<
    ReturnType<
      typeof import('./user-groups/route-auth').getUserGroupRoutePermissions
    >
  >
) {
  if (!permissions) return false;
  if (permissions.containsPermission('manage_workspace_settings')) return true;

  return ids.every((id) => {
    if (CONTACTS_USER_STATUS_CONFIG_IDS.has(id)) {
      return (
        permissions.containsPermission('view_users_public_info') ||
        permissions.containsPermission('view_users_private_info') ||
        permissions.containsPermission('view_user_groups') ||
        permissions.containsPermission('update_users')
      );
    }
    if (CONTACTS_FEATURE_TOGGLE_CONFIG_IDS.has(id)) {
      return permissions.containsPermission('view_user_groups');
    }
    if (CONTACTS_USER_MANAGEMENT_CONFIG_IDS.has(id)) {
      return (
        permissions.containsPermission('view_user_groups') ||
        permissions.containsPermission('update_users')
      );
    }
    if (CONTACTS_REPORT_CONFIG_IDS.has(id)) {
      return (
        permissions.containsPermission('view_user_groups_reports') ||
        permissions.containsPermission('approve_reports') ||
        permissions.containsPermission('manage_user_report_templates')
      );
    }
    if (CONTACTS_PROFILE_LINK_CONFIG_IDS.has(id)) {
      return permissions.containsPermission('manage_user_profile_links');
    }
    return false;
  });
}
