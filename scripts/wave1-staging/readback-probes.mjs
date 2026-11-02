// Anonymous and service-token HTTP probes for Access-protected staging hosts
// (design §9: R4, N1–N5, N10). Read-only: no request carries a staff
// identity, nothing follows redirects and every body is cancelled unread
// beyond a small bound.
import { randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';

const TIMEOUT_MS = 15_000;
const MAX_BODY = 64 * 1024;

export async function probe(fetcher, url, init = {}) {
  try {
    const response = await fetcher(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let body = '';
    if (init.readBody && response.body) {
      const reader = response.body.getReader();
      let size = 0;
      const chunks = [];
      try {
        while (size <= MAX_BODY) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel();
      }
      body = Buffer.concat(chunks).toString('utf8').slice(0, MAX_BODY);
    } else await response.body?.cancel();
    return {
      status: response.status,
      location: response.headers.get('location') ?? '',
      setCookie: response.headers.getSetCookie?.() ?? [],
      body,
      headers: response.headers,
    };
  } catch (error) {
    return {
      status: 0,
      error: error?.name ?? 'Error',
      location: '',
      setCookie: [],
      body: '',
    };
  }
}

/** True when Access (or an origin) refused: a login redirect, 401 or 403. */
export function accessDenied(result) {
  if (result.status === 401 || result.status === 403) return true;
  if (result.status >= 300 && result.status < 400) {
    try {
      return new URL(result.location).hostname.endsWith(
        '.cloudflareaccess.com'
      );
    } catch {
      return false;
    }
  }
  return false;
}

const forgedJwt = `${Buffer.from('{"alg":"RS256","kid":"x"}').toString('base64url')}.${Buffer.from(
  '{"aud":"x"}'
).toString('base64url')}.${'A'.repeat(43)}`;

export async function hostProbes({
  target,
  fetcher,
  serviceToken,
  expectedSha,
}) {
  const base = `https://${target.host}`;
  const checks = [];
  const add = (id, ok, detail) =>
    checks.push({ id, host: target.host, ok, detail });
  const anon = async (id, path, init) => {
    const result = await probe(fetcher, `${base}${path}`, init);
    add(
      id,
      accessDenied(result),
      `${init?.method ?? 'GET'} ${path} -> ${result.status || result.error}`
    );
  };
  // N1/N2: anonymous reads are denied by Access, never served.
  for (const path of [
    '/',
    '/api/build-info',
    '/en/login',
    '/api/v1/calendar/auth/callback',
  ])
    await anon(target.issuer ? 'N1' : 'N2', path);
  // N3: other methods are denied too. OPTIONS may reach only the issuer, and
  // then only as the Worker's empty local preflight answer.
  for (const method of ['POST', 'HEAD'])
    await anon('N3', '/api/build-info', { method });
  const preflight = await probe(fetcher, `${base}/api/build-info`, {
    method: 'OPTIONS',
    readBody: true,
    headers: {
      origin: 'https://calendar.tutur3u.com',
      'access-control-request-method': 'POST',
    },
  });
  add(
    'N3',
    target.issuer
      ? (preflight.status === 204 &&
          preflight.body === '' &&
          preflight.setCookie.length === 0) ||
          accessDenied(preflight)
      : accessDenied(preflight),
    `OPTIONS -> ${preflight.status || preflight.error}`
  );
  // N4: a forged Access cookie or assertion header is denied.
  await anon('N4', '/api/build-info', {
    headers: { cookie: `CF_Authorization=${forgedJwt}` },
  });
  await anon('N4', '/api/build-info', {
    headers: { 'cf-access-jwt-assertion': forgedJwt },
  });
  // R4: the CI service token reaches the exact admitted build.
  if (serviceToken?.clientId && serviceToken?.clientSecret) {
    const identityPath = target.issuer ? '/__web1' : '/api/build-info';
    const identity = await probe(fetcher, `${base}${identityPath}`, {
      readBody: true,
      headers: {
        'cf-access-client-id': serviceToken.clientId,
        'cf-access-client-secret': serviceToken.clientSecret,
      },
    });
    let info = null;
    try {
      info = JSON.parse(identity.body);
    } catch {}
    add(
      'R4',
      identity.status === 200 &&
        (target.issuer
          ? info?.app === 'web' &&
            info?.status === 'candidate' &&
            info?.pages === 'not-migrated' &&
            (!expectedSha ||
              identity.headers?.get('x-tuturuuu-source-sha') === expectedSha)
          : info?.environment === 'staging' &&
            (!expectedSha || info?.commitHash === expectedSha)),
      `${identityPath} -> ${identity.status || identity.error}`
    );
    // N17 through the issuer Worker: client-injected Vercel bypass controls
    // (header and query) never mint a `_vercel*` cookie or leak `x-vercel-*`.
    if (target.issuer) {
      const injected = await probe(
        fetcher,
        `${base}/login?x-vercel-protection-bypass=guess&x-vercel-set-bypass-cookie=true`,
        {
          headers: {
            'cf-access-client-id': serviceToken.clientId,
            'cf-access-client-secret': serviceToken.clientSecret,
            'x-vercel-protection-bypass': 'guess',
            'x-vercel-set-bypass-cookie': 'samesitenone',
          },
        }
      );
      const leaked = [...(injected.headers?.keys?.() ?? [])].filter((name) =>
        name.startsWith('x-vercel-')
      );
      add(
        'N17',
        injected.status === 404 &&
          injected.headers?.get('x-tuturuuu-native') === 'not-migrated' &&
          injected.headers?.get('cache-control') === 'no-store' &&
          !injected.setCookie.some((cookie) => /^\s*_vercel/iu.test(cookie)) &&
          leaked.length === 0,
        `injected bypass controls -> ${injected.status || injected.error}${leaked.length ? ` leaked ${leaked.join(',')}` : ''}`
      );
    }
  } else add('R4', false, 'CF_ACCESS_HEALTH_CLIENT_ID/SECRET not provided');
  return checks;
}

/** N5: workers.dev and preview URLs never execute the staging Worker. */
export async function workersDevProbes({ target, subdomain, fetcher }) {
  const checks = [];
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(subdomain ?? ''))
    return [
      {
        id: 'N5',
        host: target.host,
        ok: false,
        detail: 'CLOUDFLARE_WORKERS_SUBDOMAIN missing',
      },
    ];
  for (const url of [
    `https://${target.worker}.${subdomain}.workers.dev/api/build-info`,
    `https://latest-${target.worker}.${subdomain}.workers.dev/api/build-info`,
  ]) {
    const result = await probe(fetcher, url);
    checks.push({
      id: 'N5',
      host: target.host,
      ok: result.status === 0 || result.status === 404 || accessDenied(result),
      detail: `${new URL(url).hostname} -> ${result.status || result.error}`,
    });
  }
  return checks;
}

/** N10: an unknown sibling under the staging parent does not resolve. */
export async function wildcardDnsProbe({ resolver = dns } = {}) {
  const name = `n10-${randomBytes(6).toString('hex')}.tutur3u.com`;
  for (const type of ['A', 'AAAA', 'CNAME']) {
    try {
      const records = await resolver.resolve(name, type);
      if (records.length)
        return {
          id: 'N10',
          host: name,
          ok: false,
          detail: `${type} resolves: wildcard DNS present`,
        };
    } catch (error) {
      if (!['ENOTFOUND', 'ENODATA'].includes(error?.code))
        return {
          id: 'N10',
          host: name,
          ok: false,
          detail: `DNS lookup failed (${error?.code ?? 'error'})`,
        };
    }
  }
  return { id: 'N10', host: name, ok: true, detail: 'NXDOMAIN' };
}
