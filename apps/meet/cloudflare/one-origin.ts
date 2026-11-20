import {
  MEET_BASE_PATH,
  MEET_CANONICAL_ORIGIN,
  MEET_LEGACY_ORIGIN,
} from '@tuturuuu/utils/meet-url';
import {
  type OneOriginConfig,
  readOneOriginEnv,
} from '@tuturuuu/utils/one-origin-routing';

// The same artifact serves the custom domain and the apex mount.
import { publicAssets } from '../src/runtime/public-assets';

export function meetOneOriginConfig(env: object): OneOriginConfig {
  const vars = env as Record<string, unknown>;
  const text = (name: string, fallback: string) =>
    typeof vars[name] === 'string' ? (vars[name] as string) : fallback;
  const state = readOneOriginEnv(vars, 'meet');
  return {
    basePath: MEET_BASE_PATH,
    sharedOrigin: MEET_CANONICAL_ORIGIN,
    subdomainOrigin: text('NEXT_PUBLIC_APP_URL', MEET_LEGACY_ORIGIN),
    basePathReady: true,
    machinePathPrefixes: [
      '/live-connect',
      '/realtime',
      '/_meet',
      '/_rum',
      '/_next',
      '/native-collaboration',
      '/en/native-collaboration',
      '/vi/native-collaboration',
      '/verify-token',
      '/en/verify-token',
      '/vi/verify-token',
    ],
    machinePaths: publicAssets,
    preserveTrailingSlash: true,
    ...state,
    redirectStatus:
      vars.TTR_ONE_ORIGIN_MEET_REDIRECT_STATUS === '302'
        ? 302
        : state.redirectStatus,
  };
}
