import type { WebCandidateEnv } from './profile';

export const requiredWebSecrets = [
  'CF_ACCESS_TEAM_DOMAIN',
  'CF_ACCESS_AUD',
] as const;

/** Worker bindings arrive with fetch; validate before serving any request. */
export function assertRequiredWebSecrets(env: WebCandidateEnv) {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Web Worker requires production mode');
  }
  for (const name of requiredWebSecrets) {
    if (!env[name]?.trim())
      throw new Error(`Missing required binding: ${name}`);
  }
}
