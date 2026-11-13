import { getToolsAppOrigin } from './tools-app-url';

/**
 * The QR generator's route inside the tools app.
 *
 * The standalone `qr.tuturuuu.com` host is retired; the generator now lives at
 * `<tools origin>/qr`. Everything still routes through here so there is one
 * place that knows where the generator moved to.
 */
const QR_APP_PATHNAME = '/qr';

/**
 * Base URL of the QR generator, including its path within the tools app.
 *
 * Deliberately not called `getQrAppOrigin`: this is no longer an origin, and
 * callers must not drop the path.
 */
export function getQrAppBaseUrl() {
  const url = new URL(getToolsAppOrigin());
  url.pathname = QR_APP_PATHNAME;

  return url;
}

export function buildQrAppUrl(
  searchParams: Record<string, string | string[] | undefined>
) {
  const url = getQrAppBaseUrl();

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
