import { generateCrossAppToken } from '@tuturuuu/auth/cross-app';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

function isLoopbackCallback(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      url.pathname === '/callback'
    );
  } catch {
    return false;
  }
}

function firstHeaderValue(value: string | null) {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .find(Boolean);
}

function normalizeOrigin(value: string | undefined | null) {
  if (!value?.trim()) {
    return null;
  }

  const [firstValue] = value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!firstValue) {
    return null;
  }

  const normalized = /^[a-z][a-z0-9+.-]*:\/\//iu.test(firstValue)
    ? firstValue
    : `https://${firstValue}`;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function isWildcardOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    return hostname === '0.0.0.0' || hostname === '::' || hostname === '[::]';
  } catch {
    return true;
  }
}

function resolveConfiguredAppOrigin() {
  const origin =
    normalizeOrigin(process.env.WEB_APP_URL) ||
    normalizeOrigin(process.env.NEXT_PUBLIC_WEB_APP_URL) ||
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(process.env.COOLIFY_URL) ||
    normalizeOrigin(process.env.COOLIFY_FQDN);

  return origin && !isWildcardOrigin(origin) ? origin : null;
}

function resolveForwardedOrigin(request: NextRequest) {
  const forwardedHost = firstHeaderValue(
    request.headers.get('x-forwarded-host')
  );
  if (!forwardedHost) {
    return null;
  }

  const forwardedProto = firstHeaderValue(
    request.headers.get('x-forwarded-proto')
  );
  const protocol =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : 'https';
  const origin = normalizeOrigin(`${protocol}://${forwardedHost}`);

  return origin && !isWildcardOrigin(origin) ? origin : null;
}

function resolveLoginOrigin(request: NextRequest) {
  const requestOrigin = request.nextUrl.origin;
  if (!isWildcardOrigin(requestOrigin)) {
    return requestOrigin;
  }

  const configuredOrigin = resolveConfiguredAppOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const forwardedOrigin = resolveForwardedOrigin(request);
  if (forwardedOrigin) {
    return forwardedOrigin;
  }

  return 'https://tuturuuu.com';
}

function resolvePublicRequestUrl(request: NextRequest, origin: string) {
  return new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    origin
  ).toString();
}

function redirectToLogin(request: NextRequest) {
  const origin = resolveLoginOrigin(request);
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set(
    'returnUrl',
    resolvePublicRequestUrl(request, origin)
  );
  return NextResponse.redirect(loginUrl);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function acceptsJson(request: NextRequest) {
  return request.headers.get('accept')?.includes('application/json') ?? false;
}

function renderCopyTokenPage(token: string, email: string | null) {
  const safeToken = escapeHtml(token);
  const safeEmail = email ? escapeHtml(email) : null;

  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tuturuuu CLI login</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        align-items: center;
        background: Canvas;
        color: CanvasText;
        display: grid;
        margin: 0;
        min-height: 100vh;
        padding: 24px;
      }

      main {
        margin: 0 auto;
        max-width: 720px;
        width: min(100%, 720px);
      }

      h1 {
        font-size: 28px;
        line-height: 1.15;
        margin: 0 0 12px;
      }

      p {
        color: color-mix(in srgb, CanvasText 72%, Canvas);
        line-height: 1.6;
        margin: 0 0 18px;
      }

      code {
        background: color-mix(in srgb, CanvasText 8%, Canvas);
        border: 1px solid color-mix(in srgb, CanvasText 14%, Canvas);
        border-radius: 8px;
        display: block;
        font: 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        overflow-wrap: anywhere;
        padding: 16px;
        user-select: all;
      }

      .meta {
        font-size: 14px;
        margin-top: 18px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Finish Tuturuuu CLI login</h1>
      <p>Copy this token, return to your terminal, and paste it at the prompt.</p>
      <code>${safeToken}</code>
      ${
        safeEmail
          ? `<p class="meta">Signed in as <strong>${safeEmail}</strong>.</p>`
          : ''
      }
    </main>
  </body>
</html>`,
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      },
    }
  );
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state')?.trim();
  if (!state) {
    return NextResponse.json({ error: 'Missing state' }, { status: 400 });
  }

  const supabase = await createClient();
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return redirectToLogin(request);
  }

  const token = await generateCrossAppToken(supabase, 'platform', 'cli', 300);
  if (!token) {
    return NextResponse.json(
      { error: 'Failed to generate CLI token' },
      { status: 500 }
    );
  }

  const email = user.email ?? null;

  if (request.nextUrl.searchParams.get('mode') === 'copy') {
    if (acceptsJson(request)) {
      return NextResponse.json(
        { email, token },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    return renderCopyTokenPage(token, email);
  }

  const redirectUri = request.nextUrl.searchParams.get('redirect_uri');
  if (!redirectUri || !isLoopbackCallback(redirectUri)) {
    return NextResponse.json(
      { error: 'Invalid CLI callback URL' },
      { status: 400 }
    );
  }

  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set('token', token);
  callbackUrl.searchParams.set('state', state);
  if (email) {
    callbackUrl.searchParams.set('email', email);
  }

  return NextResponse.redirect(callbackUrl);
}
