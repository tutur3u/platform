import profiles from './native-profiles.json' with { type: 'json' };

/**
 * Build-time selector for the native Finance artifact. Staging is the default;
 * `production` must be requested explicitly. Each profile admits only its own
 * root host, so a staging-data artifact can never serve finance.tuturuuu.com.
 * Node-side only (Void/Vite config, runtime fixtures): the Worker receives just
 * the selected root host through a Vite define, never the other profile.
 */
export const FINANCE_NATIVE_PROFILE_ENV = 'VITE_FINANCE_NATIVE_PROFILE';

export type FinanceNativeProfileName = keyof typeof profiles;

const CI_PUBLISHABLE_PLACEHOLDER = 'sb_publishable_finance_ci_placeholder';

export function resolveFinanceNativeProfile(value: string | undefined) {
  const name = value || 'staging';
  if (name !== 'staging' && name !== 'production') {
    throw new Error(`Unknown ${FINANCE_NATIVE_PROFILE_ENV}: ${name}`);
  }
  return { name, ...profiles[name] };
}

/**
 * Pins the browser bundle's public values to the selected profile before the
 * bridge preset inlines `NEXT_PUBLIC_*`: unset values are filled from the
 * profile and conflicting shell values fail the build.
 */
export function applyFinanceNativeProfileEnv(
  env: Record<string, string | undefined>
) {
  const profile = resolveFinanceNativeProfile(env[FINANCE_NATIVE_PROFILE_ENV]);
  for (const [key, value] of Object.entries(profile.vars)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    const current = env[key];
    if (current && current !== value) {
      throw new Error(
        `${key} conflicts with the ${profile.name} Finance native profile`
      );
    }
    env[key] = value;
  }
  const publishable = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (
    profile.name === 'production' &&
    (!publishable || publishable === CI_PUBLISHABLE_PLACEHOLDER)
  ) {
    throw new Error(
      'The production Finance profile requires a real NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  }
  return profile;
}
