export function assertStartupEnvironment(env) {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Worker requires NODE_ENV=production');
  }
  if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    throw new Error('Missing required binding: ASSETS');
  }
  for (const name of [
    'TUTURUUU_APP_COORDINATION_SECRET',
    'SUPABASE_SECRET_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]) {
    if (typeof env[name] !== 'string' || !env[name].trim()) {
      throw new Error(`Missing required runtime configuration: ${name}`);
    }
  }
  if (
    env.TUTURUUU_APP_COORDINATION_SECRET.trim() ===
    'tuturuuu-local-development-app-coordination-secret'
  ) {
    throw new Error('Development coordination secret is forbidden');
  }
}
