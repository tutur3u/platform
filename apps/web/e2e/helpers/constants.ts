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

/** Path to persisted auth state (cookies + localStorage) */
export const AUTH_STATE_PATH = 'e2e/.auth/user.json';
