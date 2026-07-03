import type { LegacyApiRouteLoaderMap } from '../types';

export const authRouteLoaders = {
  'auth/callback/route.ts': () => import('../auth/callback/route'),
  'auth/dev-login/route.ts': () => import('../auth/dev-login/route'),
  'auth/dev-session/route.ts': () => import('../auth/dev-session/route'),
  'auth/generate-app-tokens/route.ts': () =>
    import('../auth/generate-app-tokens/route'),
  'auth/logout/route.ts': () => import('../auth/logout/route'),
  'auth/me/route.ts': () => import('../auth/me/route'),
  'auth/me/session/route.ts': () => import('../auth/me/session/route'),
  'auth/mfa/totp/assurance-level/route.ts': () =>
    import('../auth/mfa/totp/assurance-level/route'),
  'auth/mfa/totp/challenge/route.ts': () =>
    import('../auth/mfa/totp/challenge/route'),
  'auth/mfa/totp/challenge/verify/route.ts': () =>
    import('../auth/mfa/totp/challenge/verify/route'),
  'auth/mfa/totp/factors/[factorId]/route.ts': () =>
    import('../auth/mfa/totp/factors/[factorId]/route'),
  'auth/mfa/totp/factors/[factorId]/verify/route.ts': () =>
    import('../auth/mfa/totp/factors/[factorId]/verify/route'),
  'auth/mfa/totp/factors/route.ts': () =>
    import('../auth/mfa/totp/factors/route'),
  'auth/verify-app-token/route.ts': () =>
    import('../auth/verify-app-token/route'),
} satisfies LegacyApiRouteLoaderMap;
