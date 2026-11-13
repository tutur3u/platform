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
  for (const [key, value] of Object.entries(profile.vars)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    const current = env[key];
    if (current && current !== value)
      throw new Error(
        `${key} conflicts with the ${profile.name} Pay native profile`
      );
    env[key] = value;
  }
  return profile;
}
