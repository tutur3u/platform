import {
  createMountedAppAuth,
  consumeMountedSharedSession,
  resolveMountedSharedSession,
} from '@tuturuuu/auth/proxy';

export const LEARN_APEX_URL = 'https://tuturuuu.com/learn';

const mounted = createMountedAppAuth(
  // The landing page is public on the mount, as on the subdomain.
  { targetApp: 'learn', publicPaths: ['/'] },
  {
    resolveMountedSharedSession: (...args) =>
      resolveMountedSharedSession(...args),
    consumeMountedSharedSession: (...args) =>
      consumeMountedSharedSession(...args),
  }
);

export const isMountedLearn = mounted.isMounted;
export const resolveMountedLearnSession = mounted.resolveSession;
export const mountedLearnAuth = mounted.auth;
