import profiles from './native-profiles.json' with { type: 'json' };

/**
 * Build-time selector for the native Storefront artifact. Staging is the
 * default; `production` must be requested explicitly. Node-side only
 * (Void/Vite config, runtime fixtures): the Worker never sees the other
 * profile.
 */
export const STOREFRONT_NATIVE_PROFILE_ENV = 'VITE_STOREFRONT_NATIVE_PROFILE';

export type StorefrontNativeProfileName = keyof typeof profiles;

const CI_PUBLISHABLE_PLACEHOLDER = 'sb_publishable_storefront_ci_placeholder';
// The app URLs that a publisher may set to the redirect alias it attaches.
const OWN_APP_URL_NAMES = new Set([
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_STOREFRONT_APP_URL',
]);

export function resolveStorefrontNativeProfile(value: string | undefined) {
  const name = value || 'staging';
  if (name !== 'staging' && name !== 'production') {
    throw new Error(`Unknown ${STOREFRONT_NATIVE_PROFILE_ENV}: ${name}`);
  }
  return { name, ...profiles[name] };
}

/**
 * Pins the browser bundle's public values to the selected profile before the
 * bridge preset inlines `NEXT_PUBLIC_*`: unset values are filled from the
 * profile, a redirect-alias origin given as the app URL (the publisher passes
 * the host it attaches) becomes the canonical origin, and any other
 * conflicting shell value fails the build.
 */
export function applyStorefrontNativeProfileEnv(
  env: Record<string, string | undefined>
) {
  const profile = resolveStorefrontNativeProfile(
    env[STOREFRONT_NATIVE_PROFILE_ENV]
  );
  // Only the production profile pins public values and has redirect aliases.
  if (!('aliasHosts' in profile)) return profile;
  const aliasOrigins = new Set(
    profile.aliasHosts.map((host) => `https://${host}`)
  );
  for (const [key, value] of Object.entries(profile.vars)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    const current = env[key];
    if (
      current &&
      current !== value &&
      !(OWN_APP_URL_NAMES.has(key) && aliasOrigins.has(current))
    ) {
      throw new Error(
        `${key} conflicts with the ${profile.name} Storefront native profile`
      );
    }
    env[key] = value;
  }
  const publishable = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!publishable || publishable === CI_PUBLISHABLE_PLACEHOLDER) {
    throw new Error(
      'The production Storefront profile requires a real NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  }
  return profile;
}
