import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';

const CURRENT_USER_APP_SESSION_TARGETS = [
  'calendar',
  'chat',
  'cms',
  'drive',
  'finance',
  'hive',
  'inventory',
  'learn',
  'mail',
  'meet',
  'mind',
  'mira',
  'nova',
  'rewise',
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
