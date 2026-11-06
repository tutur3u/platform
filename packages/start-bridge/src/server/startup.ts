export function assertWorkerStartup({
  profile,
  env,
  requiredSecrets,
  nodeEnv = process.env.NODE_ENV,
}: {
  profile: 'production' | 'staging' | 'development';
  env: object;
  requiredSecrets: readonly string[];
  nodeEnv?: string;
}): void {
  if (profile === 'production' && nodeEnv !== 'production')
    throw new Error('Production Worker requires NODE_ENV=production');
  for (const name of requiredSecrets) {
    const value: unknown = Object.hasOwn(env, name)
      ? Reflect.get(env, name)
      : undefined;
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`Missing required Worker secret: ${name}`);
  }
}
