import type { LiveSessionClaims } from '../../features/live-assistant/contracts';
import type { LiveEnvironment } from './storage';

export function acceptsLiveOrigin(
  origin: string | null,
  app: LiveSessionClaims['app'],
  env: Pick<
    LiveEnvironment,
    'NEXT_PUBLIC_APP_URL' | 'APP_ORIGIN' | 'PARLEY_APP_URL'
  >
) {
  if (app === 'parley') return origin === env.PARLEY_APP_URL;
  return [env.NEXT_PUBLIC_APP_URL, env.APP_ORIGIN].some(
    (configured) => configured && origin === new URL(configured).origin
  );
}
