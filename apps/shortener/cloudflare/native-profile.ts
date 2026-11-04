import profiles from './native-profiles.json' with { type: 'json' };

/** Build-time selector; staging is the default and production is explicit. */
export const SHORTENER_NATIVE_PROFILE_ENV = 'VITE_SHORTENER_NATIVE_PROFILE';

export function resolveShortenerNativeProfile(value: string | undefined) {
  const name = value || 'staging';
  if (name !== 'staging' && name !== 'production')
    throw new Error(`Unknown ${SHORTENER_NATIVE_PROFILE_ENV}: ${name}`);
  return { name, ...profiles[name] };
}
