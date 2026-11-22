import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';

const CURRENT_USER_APP_SESSION_TARGETS = [
  'ai',
  'calendar',
  'chat',
  'cms',
  'contacts',
  'drive',
  'finance',
  'forms',
  'hive',
  'infra',
  'inventory',
  'lettin',
  'learn',
  'mail',
  'meet',
  'mind',
  'mira',
  'nova',
  'pay',
  'rewise',
  'storefront',
  'tasks',
  'teach',
  'track',
  CLI_APP_TARGET_APP,
] as const;

export const CURRENT_USER_APP_SESSION_AUTH = {
  targetApp: CURRENT_USER_APP_SESSION_TARGETS,
} as const;

export const CURRENT_USER_PROFILE_READ_SCOPE = 'users:profile:read';
export const CURRENT_USER_PROFILE_WRITE_SCOPE = 'users:profile:write';

export const CURRENT_USER_PROFILE_READ_APP_SESSION_AUTH = [
  CURRENT_USER_APP_SESSION_AUTH,
  { requiredScope: CURRENT_USER_PROFILE_READ_SCOPE },
  { requiredScope: CURRENT_USER_PROFILE_WRITE_SCOPE },
] as const;

export const CURRENT_USER_PROFILE_WRITE_APP_SESSION_AUTH = [
  CURRENT_USER_APP_SESSION_AUTH,
  { requiredScope: CURRENT_USER_PROFILE_WRITE_SCOPE },
] as const;

/**
 * Workspace media routes (`workspaces/{wsId}/avatar/upload-url`,
 * `workspaces/{wsId}/users/avatar`) accept first-party app sessions only:
 * `users:profile:write` covers the user's own profile, and no external-app
 * scope grants workspace media.
 */
export const WORKSPACE_MEDIA_APP_SESSION_AUTH = CURRENT_USER_APP_SESSION_AUTH;
