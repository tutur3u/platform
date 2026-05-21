import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getQrAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'qr',
    candidates: [process.env.QR_APP_URL, process.env.NEXT_PUBLIC_QR_APP_URL],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://qr.tuturuuu.com'
        : getLocalInternalAppUrl('qr', 'http://localhost:7819'),
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
