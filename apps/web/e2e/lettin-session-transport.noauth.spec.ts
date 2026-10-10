import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type BrowserContext, expect, test } from '@playwright/test';
import {
  APP_SESSION_COOKIE_NAME,
  APP_SESSION_SCOPE,
  createAppSessionToken,
  verifyAppSessionToken,
  WEB_APP_SESSION_COOKIE_NAME,
} from '@tuturuuu/auth/app-session';
import {
  profileMediaUploadOptions,
  withProfileMediaUploadCors,
} from '../src/lib/profile-media-upload-cors';
import {
  createLettinBrowserContext,
  createLettinSessionRequestOptions,
} from './helpers/lettin-session';

// Local transport/verified-claims proof only, not satellite middleware or storage.
const secret = 'lettin-transport-local-synthetic-signing-secret';
const actor = '11111111-1111-4111-8111-111111111111';
const cookieNames = [APP_SESSION_COOKIE_NAME, WEB_APP_SESSION_COOKIE_NAME];
const invalidDestination = 'Invalid Lettin session request destination';

type NetworkEvent = {
  method: string;
  path: string;
  authorizationPresent: boolean;
  cookiePresent: boolean;
  requestedMethod: string | null;
  requestedHeaders: string[];
  status: number;
};

function webRequest(request: IncomingMessage, origin: string) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
    } else if (value !== undefined) headers.set(name, value);
  }
  return new Request(`${origin}${request.url ?? '/'}`, {
    method: request.method,
    headers,
  });
}

function hasVerifiedActor(token: string | undefined) {
  if (!token) return false;
  const verified = verifyAppSessionToken(token, {
    secret,
    targetApp: 'lettin',
  });
  return (
    verified.ok &&
    verified.claims.sub === actor &&
    verified.claims.target_app === 'lettin' &&
    verified.claims.origin_app === 'web' &&
    verified.claims.scopes.includes(APP_SESSION_SCOPE)
  );
}

function hasVerifiedCookies(request: IncomingMessage) {
  const cookies = new Map(
    (request.headers.cookie ?? '').split(';').map((part) => {
      const [name, ...value] = part.trim().split('=');
      return [name, value.join('=')] as const;
    })
  );
  return cookieNames.every((name) => hasVerifiedActor(cookies.get(name)));
}

async function listen(server: Server, hostname: string) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return `http://${hostname}:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server) {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

test('isolates session transport through native browser preflights and redirects', async ({
  browser,
}) => {
  const previousPublic = process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS;
  const previousServer = process.env.TUTURUUU_EXTERNAL_APP_DOMAINS;
  const uploadEvents: NetworkEvent[] = [];
  const pageEvents: NetworkEvent[] = [];
  const fixtureErrors: boolean[] = [];
  let satelliteOrigin = '';
  let uploadOrigin = '';
  let context: BrowserContext | undefined;

  function event(request: IncomingMessage, status: number): NetworkEvent {
    return {
      method: request.method ?? 'GET',
      path: (request.url ?? '/').split('?')[0]!,
      authorizationPresent: request.headers.authorization !== undefined,
      cookiePresent: request.headers.cookie !== undefined,
      requestedMethod:
        String(request.headers['access-control-request-method'] ?? '') || null,
      requestedHeaders: String(
        request.headers['access-control-request-headers'] ?? ''
      )
        .split(',')
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)
        .sort(),
      status,
    };
  }

  const satellite = createServer((request, response) => {
    try {
      request.resume();
      const path = (request.url ?? '/').split('?')[0];
      const cookiesVerified = hasVerifiedCookies(request);
      const bearerVerified = hasVerifiedActor(
        request.headers.authorization?.replace(/^Bearer /u, '')
      );
      let status = 200;
      if (path === '/private') status = cookiesVerified ? 200 : 401;
      if (path === '/api/profile' || path === '/api/admin-import') {
        status = cookiesVerified && bearerVerified ? 200 : 401;
        if (status === 200 && path === '/api/admin-import') status = 403;
      }
      if (path === '/redirect') {
        status = 302;
        response.setHeader('Location', `${uploadOrigin}/redirected`);
      }
      pageEvents.push(event(request, status));
      response.statusCode = status;
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><title>Local transport fixture</title><link rel="icon" href="data:,">'
      );
    } catch {
      fixtureErrors.push(true);
      response.statusCode = 500;
      response.end();
    }
  });
  const upload = createServer((request, response) => {
    try {
      request.resume();
      const nativeRequest = webRequest(request, uploadOrigin);
      const corsResponse =
        request.method === 'OPTIONS'
          ? profileMediaUploadOptions(nativeRequest)
          : withProfileMediaUploadCors(nativeRequest, new Response(null));
      uploadEvents.push(event(request, corsResponse.status));
      response.statusCode = corsResponse.status;
      corsResponse.headers.forEach((value, name) => {
        response.setHeader(name, value);
      });
      response.end(
        request.method === 'OPTIONS' ? undefined : 'synthetic upload'
      );
    } catch {
      fixtureErrors.push(true);
      response.statusCode = 500;
      response.end();
    }
  });

  try {
    satelliteOrigin = await listen(satellite, 'localhost');
    uploadOrigin = await listen(upload, '127.0.0.1');
    process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS = `transport-fixture:${satelliteOrigin}`;
    delete process.env.TUTURUUU_EXTERNAL_APP_DOMAINS;
    const session = createAppSessionToken(
      {
        email: 'synthetic-transport@example.invalid',
        originApp: 'web',
        targetApp: 'lettin',
        userId: actor,
      },
      { secret }
    ).token;
    context = await createLettinBrowserContext(
      browser,
      satelliteOrigin,
      session
    );
    const options = createLettinSessionRequestOptions(satelliteOrigin, session);
    const page = await context.newPage();
    const privateResponse = await page.goto(`${satelliteOrigin}/private`);
    expect(privateResponse?.status()).toBe(200);
    expect(pageEvents.filter((entry) => entry.path === '/private')).toEqual([
      expect.objectContaining({
        authorizationPresent: false,
        cookiePresent: true,
        status: 200,
      }),
    ]);
    const cookies = await context.cookies(satelliteOrigin);
    for (const name of cookieNames) {
      expect(cookies.find((cookie) => cookie.name === name)).toMatchObject({
        httpOnly: true,
        sameSite: 'Lax',
      });
    }

    const apiUrl = `${satelliteOrigin}/api/profile`;
    expect((await context.request.get(apiUrl, options(apiUrl))).status()).toBe(
      200
    );
    expect(pageEvents.filter((entry) => entry.path === '/api/profile')).toEqual(
      [
        expect.objectContaining({
          authorizationPresent: true,
          cookiePresent: true,
          status: 200,
        }),
      ]
    );
    const adminUrl = `${satelliteOrigin}/api/admin-import`;
    expect(
      (await context.request.post(adminUrl, options(adminUrl))).status()
    ).toBe(403);
    expect(
      pageEvents.filter((entry) => entry.path === '/api/admin-import')
    ).toEqual([
      expect.objectContaining({
        authorizationPresent: true,
        cookiePresent: true,
        status: 403,
      }),
    ]);

    const wrongTarget = createAppSessionToken(
      { targetApp: 'mail', userId: actor },
      { secret }
    ).token;
    const tampered = `${session.slice(0, -1)}${session.endsWith('a') ? 'b' : 'a'}`;
    for (const candidate of [null, tampered, wrongTarget]) {
      await context.clearCookies();
      if (candidate)
        await context.addCookies(
          cookieNames.map((name) => ({
            name,
            value: candidate,
            url: satelliteOrigin,
            httpOnly: true,
            sameSite: 'Lax' as const,
          }))
        );
      expect((await page.goto(`${satelliteOrigin}/private`))?.status()).toBe(
        401
      );
    }
    await context.addCookies(
      cookieNames.map((name) => ({
        name,
        value: session,
        url: satelliteOrigin,
        httpOnly: true,
        sameSite: 'Lax' as const,
      }))
    );
    expect((await page.goto(`${satelliteOrigin}/private`))?.status()).toBe(200);

    // No routes, HAR, fetch mocks or interception: OPTIONS must reach the socket.
    const positive = await page.evaluate(async (destination) => {
      const response = await fetch(destination, {
        method: 'PUT',
        credentials: 'omit',
        headers: { 'Content-Type': 'image/webp' },
        body: new Uint8Array([82, 73, 70, 70]),
      });
      return { status: response.status, body: await response.text() };
    }, `${uploadOrigin}/positive`);
    expect(positive).toEqual({ status: 200, body: 'synthetic upload' });
    expect(uploadEvents.filter((entry) => entry.path === '/positive')).toEqual([
      {
        method: 'OPTIONS',
        path: '/positive',
        authorizationPresent: false,
        cookiePresent: false,
        requestedMethod: 'PUT',
        requestedHeaders: ['content-type'],
        status: 204,
      },
      {
        method: 'PUT',
        path: '/positive',
        authorizationPresent: false,
        cookiePresent: false,
        requestedMethod: null,
        requestedHeaders: [],
        status: 200,
      },
    ]);

    const malicious = await page.evaluate(async (destination) => {
      try {
        await fetch(destination, {
          method: 'PUT',
          credentials: 'omit',
          headers: {
            'Content-Type': 'image/webp',
            authorization: 'Bearer synthetic-malicious',
          },
          body: new Uint8Array([82, 73, 70, 70]),
        });
        return false;
      } catch {
        return true;
      }
    }, `${uploadOrigin}/malicious`);
    expect(malicious).toBe(true);
    expect(uploadEvents.filter((entry) => entry.path === '/malicious')).toEqual(
      [
        {
          method: 'OPTIONS',
          path: '/malicious',
          authorizationPresent: false,
          cookiePresent: false,
          requestedMethod: 'PUT',
          requestedHeaders: ['authorization', 'content-type'],
          status: 403,
        },
      ]
    );

    const redirectUrl = `${satelliteOrigin}/redirect`;
    const countBefore = uploadEvents.length;
    expect(
      (await context.request.get(redirectUrl, options(redirectUrl))).status()
    ).toBe(302);
    expect(uploadEvents).toHaveLength(countBefore);
    expect(pageEvents.filter((entry) => entry.path === '/redirect')).toEqual([
      expect.objectContaining({ authorizationPresent: true }),
    ]);
    expect((await page.goto(redirectUrl))?.status()).toBe(200);
    expect(
      pageEvents.filter((entry) => entry.path === '/redirect').at(-1)
    ).toMatchObject({ authorizationPresent: false });
    expect(uploadEvents.at(-1)).toMatchObject({
      path: '/redirected',
      authorizationPresent: false,
      cookiePresent: false,
    });
    // A second external origin uses the other socket's IP alias, a different host.
    const secondExternal = satelliteOrigin.replace('localhost', '127.0.0.1');
    expect((await page.goto(`${secondExternal}/external`))?.status()).toBe(200);
    expect(pageEvents.filter((entry) => entry.path === '/external')).toEqual([
      expect.objectContaining({
        authorizationPresent: false,
        cookiePresent: false,
      }),
    ]);

    const beforeReject = {
      upload: uploadEvents.length,
      satellite: pageEvents.length,
    };
    for (const destination of [
      `${uploadOrigin}/forbidden`,
      `${secondExternal}/forbidden`,
      `http://localhost:${new URL(uploadOrigin).port}/forbidden`,
      satelliteOrigin.replace('http:', 'https:'),
      `${satelliteOrigin}.evil.invalid/forbidden`,
      satelliteOrigin.replace('localhost', 'localhost.evil.invalid'),
      satelliteOrigin.replace('http://', 'http://synthetic:password@'),
      'file:///synthetic',
      'invalid destination',
    ]) {
      // Argument evaluation must reject before APIRequestContext can dispatch.
      await expect(async () => {
        await context!.request.get(destination, options(destination));
      }).rejects.toThrow(invalidDestination);
    }
    expect(uploadEvents).toHaveLength(beforeReject.upload);
    expect(pageEvents).toHaveLength(beforeReject.satellite);
    for (const origin of [
      'invalid origin',
      'file:///synthetic',
      'https://user:password@localhost',
    ]) {
      expect(() => createLettinSessionRequestOptions(origin, session)).toThrow(
        invalidDestination
      );
    }
    const canonicalOptions = createLettinSessionRequestOptions(
      `${satelliteOrigin}/canonical`,
      session
    );
    expect(canonicalOptions(apiUrl).maxRedirects).toBe(0);
    const httpsOptions = createLettinSessionRequestOptions(
      'HTTPS://LOCALHOST:443/canonical',
      session
    );
    expect(httpsOptions('https://localhost/api/profile').maxRedirects).toBe(0);
    expect(fixtureErrors).toEqual([]);
  } finally {
    try {
      await context?.close();
    } finally {
      try {
        await Promise.all([close(satellite), close(upload)]);
      } finally {
        if (previousPublic === undefined)
          delete process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS;
        else
          process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS =
            previousPublic;
        if (previousServer === undefined)
          delete process.env.TUTURUUU_EXTERNAL_APP_DOMAINS;
        else process.env.TUTURUUU_EXTERNAL_APP_DOMAINS = previousServer;
      }
    }
  }
});
