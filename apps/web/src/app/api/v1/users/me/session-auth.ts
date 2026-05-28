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
