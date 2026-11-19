declare global {
  interface ImportMetaEnv {
    readonly VITE_EXTERNAL_NATIVE_PROFILE?: string;
  }
}

export function deploymentProfile(value = 'staging') {
  if (value !== 'staging' && value !== 'production') {
    throw new Error('Unknown External native profile');
  }
  const production = value === 'production';
  return {
    name: production ? 'tuturuuu-external' : 'tuturuuu-external-vite-staging',
    mountHosts: production ? ['tuturuuu.com'] : [],
  };
}
