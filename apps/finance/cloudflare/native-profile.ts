import profiles from './native-profiles.json' with { type: 'json' };

/**
 * Build-time selector for the native Finance artifact. Staging is the default;
 * `production` must be requested explicitly. Each profile admits only its own
 * root host, so a staging-data artifact can never serve finance.tuturuuu.com.
 */
export const FINANCE_NATIVE_PROFILE_ENV = 'VITE_FINANCE_NATIVE_PROFILE';

export type FinanceNativeProfileName = keyof typeof profiles;

export function resolveFinanceNativeProfile(value: string | undefined) {
  const name = value || 'staging';
  if (name !== 'staging' && name !== 'production') {
    throw new Error(`Unknown ${FINANCE_NATIVE_PROFILE_ENV}: ${name}`);
  }
  return { name, ...profiles[name] };
}
