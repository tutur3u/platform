import { vi } from 'vitest';
import {
  defineLoginRedirectTests,
  loginRedirectMocks,
  normalizeAuthRedirectPath,
} from '../../../../../../packages/auth/src/proxy/login-redirect-test-fixture';

// Register app dependencies from this workspace, as package resolution is relative.
vi.mock('@tuturuuu/auth/proxy', () => ({ normalizeAuthRedirectPath }));
vi.mock('@tuturuuu/auth/app-session', () => ({
  hasSupportedSupabaseAuthCookie: () => false,
  hasWebAppSessionTokenFromRequest: loginRedirectMocks.webSession,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSession: loginRedirectMocks.session,
}));
vi.mock('next/headers', () => ({ headers: loginRedirectMocks.headers }));
vi.mock('next/navigation', () => ({ redirect: loginRedirectMocks.redirect }));
vi.mock('@/constants/common', () => ({
  BASE_URL: loginRedirectMocks.origin,
  WEB_APP_URL: 'https://web.example.test',
  TTR_URL: 'https://web.example.test',
}));

defineLoginRedirectTests({
  app: 'nova',
  fallback: '/home',
  load: () => import('./page'),
  centralOnly: true,
});
