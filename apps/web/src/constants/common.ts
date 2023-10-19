import { WorkspacePreset } from '@/types/primitives/WorkspacePreset';
import { version } from '../core/version';

export const APP_VERSION = version;

export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';

export const BASE_URL = process.env.BASE_URL || 'http://localhost:7803';
export const API_URL = process.env.API_URL || 'http://localhost:7803/api';

export const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

export const AI_CHAT_DISABLED_PRESETS: WorkspacePreset[] = [
  'EDUCATION',
  'PHARMACY',
];

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';
export const THEME_COOKIE_NAME = 'NEXT_THEME';

// The following option only works in development mode.
export const HIDE_TAILWIND_INDICATOR =
  process.env.HIDE_TAILWIND_INDICATOR !== 'false';
