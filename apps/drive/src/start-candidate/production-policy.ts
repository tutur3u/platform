import productionVars from '../../cloudflare/production-profile.json';
import { STAGING_SUPABASE_ORIGIN } from './staging-policy';

export function isDriveProductionEnvironment(
  env: Partial<
    Record<keyof typeof productionVars | 'NEXT_PUBLIC_SUPABASE_URL', string>
  >
) {
  if (
    !Object.entries(productionVars).every(([key, value]) =>
      Object.entries(env).some(
        ([name, configured]) => name === key && configured === value
      )
    )
  )
    return false;
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.origin !== STAGING_SUPABASE_ORIGIN &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
