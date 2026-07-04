/** Seed accounts from apps/database/supabase/seed.sql */
export const TEST_USER = {
  email: 'local@tuturuuu.com',
  password: 'password123',
  id: '00000000-0000-0000-0000-000000000001',
} as const;

export const DEFAULT_LOCALE = 'en';

/**
 * Stable authenticated web-owned workspace route covered by the seeded e2e
 * account. Keep this away from satellite-owned routes so generic web shell and
 * account settings tests do not depend on production satellite domains.
 */
export const TEST_WORKSPACE_ROUTE = 'personal';

/** Dashboard URL for the authenticated test user */
export const DASHBOARD_URL = `/${DEFAULT_LOCALE}/${TEST_WORKSPACE_ROUTE}`;

/** Path to persisted auth state (cookies + localStorage) */
export const AUTH_STATE_PATH = 'e2e/.auth/user.json';
