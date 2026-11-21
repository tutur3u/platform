import {
  createMountedAppAuth,
  consumeMountedSharedSession,
  resolveMountedSharedSession,
} from '@tuturuuu/auth/proxy';

export const TEACH_APEX_URL = 'https://tuturuuu.com/teach';

const mounted = createMountedAppAuth(
  // The landing page is public on the mount, as on the subdomain.
  { targetApp: 'teach', publicPaths: ['/'] },
  {
    resolveMountedSharedSession: (...args) =>
      resolveMountedSharedSession(...args),
    consumeMountedSharedSession: (...args) =>
      consumeMountedSharedSession(...args),
  }
);

export const isMountedTeach = mounted.isMounted;
export const resolveMountedTeachSession = mounted.resolveSession;
export const mountedTeachAuth = mounted.auth;
