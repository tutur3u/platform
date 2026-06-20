import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function pricingRedirectHref() {
  return '/?hash-nav=1#pricing';
}

export function docsRedirectHref() {
  return 'https://docs.tuturuuu.com';
}

export function meetTogetherProductRedirectHref() {
  return '/meet-together';
}

export function meetTogetherCalendarRedirectHref(splat?: string) {
  const normalizedSplat = splat?.replace(/^\/+|\/+$/g, '');

  return normalizedSplat
    ? `/meet-together/${normalizedSplat}`
    : '/meet-together';
}

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

function normalizeSearchParams(search: string | URLSearchParams) {
  if (typeof search !== 'string') return search;

  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

export function buildQrGeneratorRedirectHref(search: string | URLSearchParams) {
  const url = new URL(getQrAppOrigin());
  const searchParams = normalizeSearchParams(search);

  for (const [key, value] of searchParams) {
    url.searchParams.append(key, value);
  }

  return url.toString();
}
