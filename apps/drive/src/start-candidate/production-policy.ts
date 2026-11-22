import productionVars from '../../cloudflare/production-profile.json';

/**
 * The profile pins every production var, including the Supabase origin, so a
 * Worker carrying any other value (or a staging one) is not production.
 */
export function isDriveProductionEnvironment(
  env: Partial<Record<keyof typeof productionVars, string>>
) {
  return Object.entries(productionVars).every(([key, value]) =>
    Object.entries(env).some(
      ([name, configured]) => name === key && configured === value
    )
  );
}
