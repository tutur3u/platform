import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { TUTURUUU_PORTLESS_ROOT_HOST } from '@tuturuuu/utils/portless';

const localRuntimeOriginKeys = [
  'BASE_URL',
  'PORTLESS_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_WEB_APP_URL',
  'WEB_APP_URL',
] as const;

function isLocalPortlessUrl(value: string | undefined) {
  if (!value?.trim()) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname;

    return (
      hostname === TUTURUUU_PORTLESS_ROOT_HOST ||
      hostname.endsWith(`.${TUTURUUU_PORTLESS_ROOT_HOST}`)
    );
  } catch {
    return false;
  }
}

/**
 * E2E suites run a production build against local Portless hosts. Without this
 * check, those runs would redirect out to the real tools deployment mid-test.
 * The retired QR app carried this handling; the tools app now owns the QR
 * generator, so it inherits the behaviour.
 */
function isLocalPortlessRuntime() {
  return localRuntimeOriginKeys.some((key) =>
    isLocalPortlessUrl(process.env[key])
  );
}

export function getToolsAppOrigin() {
  const localOrigin = getLocalInternalAppUrl('tools', 'http://localhost:7825');

  return resolveInternalAppUrl({
    appName: 'tools',
    candidates: [
      process.env.TOOLS_APP_URL,
      process.env.NEXT_PUBLIC_TOOLS_APP_URL,
    ],
    fallback:
      isLocalPortlessRuntime() || process.env.NODE_ENV !== 'production'
        ? localOrigin
        : 'https://tools.tuturuuu.com',
  });
}
