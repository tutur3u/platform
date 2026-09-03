import { type NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { type Locale, routing } from '@/i18n/routing';
import { createHivePublicUrl } from '@/lib/hive-public-url';

const SUPABASE_AUTH_COOKIE_PATTERN = /^sb-[A-Za-z0-9-]+-auth-token(?:\.\d+)?$/u;
const CLEAR_SITE_DATA_VALUE = '"cache", "storage", "executionContexts"';

function getAuthCookieNames(request: NextRequest): string[] {
  return request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((cookieName) => SUPABASE_AUTH_COOKIE_PATTERN.test(cookieName));
}

function getRequestLocale(request: NextRequest): Locale {
  const locale = request.cookies.get('NEXT_LOCALE')?.value;

  return locale && routing.locales.includes(locale as Locale)
    ? (locale as Locale)
    : routing.defaultLocale;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character
  );
}

function applyNoStoreHeaders(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('CDN-Cache-Control', 'no-store');
}

function applyClearSiteDataHeaders(response: NextResponse) {
  applyNoStoreHeaders(response);
  response.headers.set('Clear-Site-Data', CLEAR_SITE_DATA_VALUE);
}

function isSameOriginRecoveryRequest(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get('referer');
  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const locale = getRequestLocale(request);
  const t = await getTranslations({
    locale,
    namespace: 'browserStateRecovery',
  });
  const title = escapeHtml(t('title'));
  const description = escapeHtml(t('description'));
  const button = escapeHtml(t('button'));
  const response = new NextResponse(
    `<!doctype html>
<html lang="${escapeHtml(locale)}">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${description}</p>
      <form method="post" action="/~recover-browser-state">
        <button type="submit">${button}</button>
      </form>
    </main>
  </body>
</html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
      status: 200,
    }
  );

  applyNoStoreHeaders(response);
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRecoveryRequest(request)) {
    const locale = getRequestLocale(request);
    const t = await getTranslations({
      locale,
      namespace: 'browserStateRecovery',
    });
    const response = NextResponse.json(
      { error: t('forbidden') },
      { status: 403 }
    );
    applyNoStoreHeaders(response);
    return response;
  }

  const redirectUrl = createHivePublicUrl(
    '/login?browserStateReset=1',
    request
  );
  const response = NextResponse.redirect(redirectUrl);

  applyClearSiteDataHeaders(response);

  for (const cookieName of getAuthCookieNames(request)) {
    response.cookies.set(cookieName, '', {
      expires: new Date(0),
      maxAge: 0,
      path: '/',
    });
  }

  return response;
}
