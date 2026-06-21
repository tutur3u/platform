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

function isLocalPortlessRuntime() {
  return localRuntimeOriginKeys.some((key) =>
    isLocalPortlessUrl(process.env[key])
  );
}

function getQrAppFallbackOrigin() {
  const localOrigin = getLocalInternalAppUrl('qr', 'http://localhost:7819');

  return isLocalPortlessRuntime() || process.env.NODE_ENV !== 'production'
    ? localOrigin
    : 'https://qr.tuturuuu.com';
}

export function getQrAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'qr',
    candidates: [process.env.QR_APP_URL, process.env.NEXT_PUBLIC_QR_APP_URL],
    fallback: getQrAppFallbackOrigin(),
  });
}

export function buildQrAppUrl(
  searchParams: Record<string, string | string[] | undefined>
) {
  const url = new URL(getQrAppOrigin());

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) url.searchParams.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}
