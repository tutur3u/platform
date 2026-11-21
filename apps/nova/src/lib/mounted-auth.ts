import {
  createMountedAppAuth,
  consumeMountedSharedSession,
  resolveMountedSharedSession,
} from '@tuturuuu/auth/proxy';

export const NOVA_APEX_URL = 'https://tuturuuu.com/nova';

const mounted = createMountedAppAuth(
  { targetApp: 'nova' },
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
