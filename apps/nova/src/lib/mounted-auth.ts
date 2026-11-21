import { NOVA_PUBLIC_PAGES } from '../constants/common';
import {
  createMountedAppAuth,
  consumeMountedSharedSession,
  resolveMountedSharedSession,
} from '@tuturuuu/auth/proxy';

export const NOVA_APEX_URL = 'https://tuturuuu.com/nova';

const mounted = createMountedAppAuth(
  // The landing and marketing pages are public on the mount, as on the
  // subdomain; exact paths only, so nested pages stay gated.
  {
    targetApp: 'nova',
    publicPaths: [
      '/',
      ...NOVA_PUBLIC_PAGES.filter((path) => path !== '/verify-token'),
    ],
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
