export const RUNTIME_ENVIRONMENTS = [
  'development',
  'staging',
  'production',
] as const;

export type RuntimeEnvironment = (typeof RUNTIME_ENVIRONMENTS)[number];

export function isRuntimeEnvironment(
  value: string
): value is RuntimeEnvironment {
  return (RUNTIME_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Deployment environment for runtime evaluation. Callers pass server process
 * context only. Preview maps to staging. An unrecognized deployed environment
 * uses production so a new flag stays on its fail-closed production default.
 */
export function resolveRuntimeFlagEnvironment(source: {
  nodeEnv?: string | null;
  vercelEnv?: string | null;
}): RuntimeEnvironment {
  const vercel = source.vercelEnv?.trim();
  if (vercel === 'production') return 'production';
  if (vercel === 'preview') return 'staging';
  if (vercel === 'development') return 'development';
  if (vercel) return 'production';
  const node = source.nodeEnv?.trim();
  if (node === 'development' || node === 'test') return 'development';
  return 'production';
}
