import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { openBrowser } from './browser';
import { type CliSession, normalizeBaseUrl } from './config';

export interface CliTokenExchangeResponse {
  session: {
    access_token: string;
    expires_at?: number | null;
    expires_in?: number;
    refresh_expires_at?: number | null;
    refresh_expires_in?: number;
    refresh_token: string;
    token_type?: string;
  };
  email?: string | null;
  sessionCreated: boolean;
  userId: string;
  valid: boolean;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

export async function exchangeCliToken({
  baseUrl,
  fetch = globalThis.fetch,
  token,
}: {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  token: string;
}) {
  const response = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/cli/auth/verify`,
    {
      body: JSON.stringify({ token }),
      headers: {
        'Content-Type': 'application/json',
        'X-CLI-Session-Name': 'Tuturuuu CLI',
      },
      method: 'POST',
    }
  );

  if (!response.ok) {
    throw new Error(`CLI token exchange failed: ${response.status}`);
  }

  const payload = (await response.json()) as CliTokenExchangeResponse;
  if (!payload.session?.access_token || !payload.session.refresh_token) {
    throw new Error('CLI token exchange did not return a session.');
  }

  return payload;
}

export async function refreshCliSession({
  baseUrl,
  fetch = globalThis.fetch,
  refreshToken,
}: {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  refreshToken: string;
}): Promise<CliSession> {
  const response = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/cli/auth/refresh`,
    {
      body: JSON.stringify({ refreshToken }),
      headers: {
        'Content-Type': 'application/json',
        'X-CLI-Session-Name': 'Tuturuuu CLI',
      },
      method: 'POST',
    }
  );

  if (!response.ok) {
    throw new Error(`CLI session refresh failed: ${response.status}`);
  }

  const payload = (await response.json()) as CliTokenExchangeResponse;
  if (!payload.session?.access_token || !payload.session.refresh_token) {
    throw new Error('CLI session refresh did not return a session.');
  }

  return {
    accessToken: payload.session.access_token,
    expiresAt: payload.session.expires_at,
    refreshExpiresAt: payload.session.refresh_expires_at,
    refreshToken: payload.session.refresh_token,
    tokenType: payload.session.token_type,
  };
}

export function buildLoginUrl({
  baseUrl,
  mode,
  redirectUri,
  state,
}: {
  baseUrl: string;
  mode?: 'copy';
  redirectUri?: string;
  state: string;
}) {
  const url = new URL('/api/cli/auth/start', normalizeBaseUrl(baseUrl));
  url.searchParams.set('state', state);

  if (mode) {
    url.searchParams.set('mode', mode);
  }

  if (redirectUri) {
    url.searchParams.set('redirect_uri', redirectUri);
  }

  return url.toString();
}

export async function readTokenFromStdin() {
  process.stdout.write('Paste token: ');
  for await (const chunk of process.stdin) {
    const token = chunk.toString().trim();
    if (token) {
      return token;
    }
  }

  throw new Error('No token was provided.');
}

export async function receiveTokenFromBrowser(baseUrl: string) {
  const state = randomBytes(24).toString('hex');

  return new Promise<string>((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const token = url.searchParams.get('token');
      const returnedState = url.searchParams.get('state');
      const email = url.searchParams.get('email');
      const safeEmail = email ? escapeHtml(email) : null;

      if (url.pathname !== '/callback') {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      if (!token || returnedState !== state) {
        response.writeHead(400, { 'Content-Type': 'text/plain' });
        response.end('Invalid CLI login callback.');
        reject(new Error('Invalid CLI login callback.'));
        server.close();
        return;
      }

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(
        `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tuturuuu CLI login complete</title>
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
        max-width: 640px;
        width: min(100%, 640px);
      }

      h1 {
        font-size: 28px;
        line-height: 1.15;
        margin: 0 0 12px;
      }

      p {
        color: color-mix(in srgb, CanvasText 72%, Canvas);
        line-height: 1.6;
        margin: 0;
      }

      .account {
        margin-top: 16px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Tuturuuu CLI login complete</h1>
      <p>Your dedicated CLI session is ready. You can close this tab and return to the terminal.</p>
      ${safeEmail ? `<p class="account">Signed in as <strong>${safeEmail}</strong>.</p>` : ''}
    </main>
  </body>
</html>`
      );
      resolve(token);
      server.close();
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not start local login callback server.'));
        server.close();
        return;
      }

      const loginUrl = buildLoginUrl({
        baseUrl,
        redirectUri: `http://127.0.0.1:${address.port}/callback`,
        state,
      });

      process.stdout.write('Opening browser for Tuturuuu CLI login...\n');
      const opened = await openBrowser(loginUrl);
      if (!opened) {
        process.stdout.write(`Open this URL to continue:\n${loginUrl}\n`);
      }
    });
  });
}
