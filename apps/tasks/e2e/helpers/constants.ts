/** Seed accounts from apps/database/supabase/seed.sql */
export const TEST_USER = {
  email: 'local@tuturuuu.com',
  password: 'password123',
  id: '00000000-0000-0000-0000-000000000001',
} as const;

export const DEFAULT_LOCALE = 'en';

/**
 * The "personal" workspace slug. The app resolves this to the user's
 * personal workspace UUID server-side.
 */
export const PERSONAL_WORKSPACE_SLUG = 'personal';

/** Dashboard URL for the authenticated test user */
export const DASHBOARD_URL = `/${DEFAULT_LOCALE}/${PERSONAL_WORKSPACE_SLUG}`;

/** Tasks page URL */
export const TASKS_URL = `${DASHBOARD_URL}/tasks`;

/** Boards page URL */
export const BOARDS_URL = `${DASHBOARD_URL}/boards`;

/** Projects page URL */
export const PROJECTS_URL = `${DASHBOARD_URL}/projects`;

/** Initiatives page URL */
export const INITIATIVES_URL = `${DASHBOARD_URL}/initiatives`;

/** Labels page URL */
export const LABELS_URL = `${DASHBOARD_URL}/labels`;

/** Notes page URL */
export const NOTES_URL = `${DASHBOARD_URL}/notes`;

/** Drafts page URL */
export const DRAFTS_URL = `${DASHBOARD_URL}/drafts`;

/** Templates page URL */
export const TEMPLATES_URL = `${DASHBOARD_URL}/templates`;

/** Logs page URL */
export const LOGS_URL = `${DASHBOARD_URL}/logs`;

/** Estimates page URL */
export const ESTIMATES_URL = `${DASHBOARD_URL}/estimates`;

/** Path to persisted auth state (cookies + localStorage) */
export const AUTH_STATE_PATH = 'e2e/.auth/user.json';

/**
 * The web app base URL. The tasks app proxies auth through the web app,
 * so we authenticate against the web app login page.
 */
export const WEB_BASE_URL = process.env.WEB_BASE_URL || 'http://localhost:7803';
