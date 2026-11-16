export const hiveApexMounts = {
  rootHosts: ['hive.tuturuuu.com'],
  mountHosts: ['tuturuuu.com'],
  basePath: '/hive',
  unknownHost: 'reject' as const,
  // Same-origin isolation on tuturuuu.com/hive (D360): Hive code sees only
  // NEXT_LOCALE, the logout fence and an access-token-only Supabase session,
  // and writes only NEXT_LOCALE, host-only at Path=/hive.
  isolation: { ownedCookies: ['NEXT_LOCALE'] },
};
