import {
  createMountedAppAuth,
  consumeMountedSharedSession,
  resolveMountedSharedSession,
} from '@tuturuuu/auth/proxy';

/**
 * Pages Nova serves signed out on tuturuuu.com/nova: its landing page and the
 * marketing pages under (marketing). Exact paths only, so every other page,
 * nested or not, stays gated. Each entry must have a route
 * (mounted-auth.test.ts checks it).
 */
export const NOVA_MOUNTED_PUBLIC_PAGES = [
  '/',
  '/learn',
  '/learn/introduction',
  '/learn/basic-techniques',
  '/learn/best-practices',
  '/learn/advanced-strategies',
  '/competitions/neo-league/prompt-the-future/about',
] as const;

export const NOVA_APEX_URL = 'https://tuturuuu.com/nova';

const mounted = createMountedAppAuth(
  {
    targetApp: 'nova',
    publicPaths: NOVA_MOUNTED_PUBLIC_PAGES,
  },
  {
    resolveMountedSharedSession: (...args) =>
      resolveMountedSharedSession(...args),
    consumeMountedSharedSession: (...args) =>
      consumeMountedSharedSession(...args),
  }
);

export const isMountedNova = mounted.isMounted;
export const resolveMountedNovaSession = mounted.resolveSession;
export const mountedNovaAuth = mounted.auth;
