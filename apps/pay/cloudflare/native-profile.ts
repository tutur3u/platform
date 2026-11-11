import profiles from './native-profiles.json' with { type: 'json' };

export const PAY_NATIVE_PROFILE_ENV = 'VITE_PAY_NATIVE_PROFILE';
export type PayNativeProfileName = keyof typeof profiles;

export function resolvePayNativeProfile(value: string | undefined) {
  const name = value || 'staging';
  if (name !== 'staging' && name !== 'production')
    throw new Error(`Unknown ${PAY_NATIVE_PROFILE_ENV}: ${name}`);
  return { name, ...profiles[name] };
}

export function applyPayNativeProfileEnv(
  env: Record<string, string | undefined>
) {
  const profile = resolvePayNativeProfile(env[PAY_NATIVE_PROFILE_ENV]);
  const basePath = profile.name === 'production' ? '/pay' : '';
  if (env.TUTURUUU_BASE_PATH && env.TUTURUUU_BASE_PATH !== basePath)
    throw new Error(
      `TUTURUUU_BASE_PATH conflicts with the ${profile.name} Pay native profile`
    );
  env.TUTURUUU_BASE_PATH = basePath;
  for (const [key, value] of Object.entries(profile.vars)) {
    if (!key.startsWith('NEXT_PUBLIC_') && key !== 'TUTURUUU_BASE_PATH')
      continue;
    const current = env[key];
    if (current && current !== value)
      throw new Error(
        `${key} conflicts with the ${profile.name} Pay native profile`
      );
    env[key] = value;
  }
  return profile;
}

/** Staging stays root-only; only the production artifact owns the apex mount. */
export function payNativeMounts(rootHost: string | undefined) {
  return {
    rootHosts: rootHost ? [rootHost] : [],
    mountHosts: rootHost === 'pay.tuturuuu.com' ? ['tuturuuu.com'] : [],
    basePath: '/pay',
    unknownHost: 'reject' as const,
  };
}
