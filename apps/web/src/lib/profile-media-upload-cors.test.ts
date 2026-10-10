// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const effects = vi.hoisted(() => {
  // The registry initializes Portless origins at import time.
  vi.stubEnv('PORTLESS_URL', '');
  return {
    verify: vi.fn(),
    consume: vi.fn(),
    admin: vi.fn(),
    optimize: vi.fn(),
    body: vi.fn(),
  };
});
vi.mock('@tuturuuu/utils/app-coordination-token', () => ({
  verifyAppCoordinationToken: effects.verify,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: effects.admin,
}));
vi.mock('@tuturuuu/storage-core/profile-upload-budget', () => ({
  consumeProfileUploadTicket: effects.consume,
  PROFILE_MEDIA_MAX_BYTES: { avatar: 1, banner: 1 },
  ProfileUploadError: class extends Error {},
}));
vi.mock('./profile-media-optimize', () => ({
  optimizeProfileMedia: effects.optimize,
}));
vi.mock('./profile-media-upload-body', () => ({
  readProfileMediaBody: effects.body,
}));
vi.mock('./profile-media-public-url', () => ({
  publicStorageUrl: vi.fn(),
}));

import { OPTIONS as avatarOptions } from '../app/api/v1/users/me/avatar/upload/route';
import { OPTIONS as bannerOptions } from '../app/api/v1/users/me/banner/upload/route';
import {
  getProfileMediaUploadOrigin,
  profileMediaUploadOptions,
  withProfileMediaUploadCors,
} from './profile-media-upload-cors';

const trusted = 'https://lettin.tuturuuu.com';
function preflight(
  origin: string | null = trusted,
  method: string | null = 'PUT',
  headers: string | null = 'content-type',
  token = 'invalid-synthetic-capability'
) {
  const request = new Request(
    `https://tuturuuu.com/api/v1/users/me/banner/upload?token=${token}`,
    { method: 'OPTIONS' }
  );
  if (origin !== null) request.headers.set('Origin', origin);
  if (method !== null)
    request.headers.set('Access-Control-Request-Method', method);
  if (headers !== null)
    request.headers.set('Access-Control-Request-Headers', headers);
  return request;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PORTLESS_PORT', '');
  vi.stubEnv('PORTLESS_URL', '');
  vi.stubEnv('NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS', '');
  vi.stubEnv('TUTURUUU_EXTERNAL_APP_DOMAINS', '');
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  trusted,
  'https://tuturuuu.com',
  'https://lettin.tuturuuu.localhost:1355',
  'https://profile.lettin.tuturuuu.localhost:1355',
  'https://profile.lettin.tuturuuu.localhost',
  'http://localhost:7803',
])('preserves the literal registered origin %s', (origin) => {
  expect(getProfileMediaUploadOrigin(preflight(origin))).toBe(origin);
  expect(
    profileMediaUploadOptions(preflight(origin)).headers.get(
      'access-control-allow-origin'
    )
  ).toBe(origin);
});

it.each([
  null,
  'null',
  'https://lettin.tuturuuu.com.attacker.test',
  'https://lettin.tuturuuu.com:1355',
  'https://lettin.tuturuuu.localhost:9999',
  'https://nested.profile.lettin.tuturuuu.localhost:1355',
  'http://localhost:9999',
  'http://lettin.tuturuuu.com',
  'https://user:pass@lettin.tuturuuu.com',
  'https://lettin.tuturuuu.com/',
  'https://lettin.tuturuuu.com/path',
  'https://lettin.tuturuuu.com?query=1',
  'https://lettin.tuturuuu.com#fragment',
  'https://lettin.tuturuuu.com?',
  'https://lettin.tuturuuu.com#',
  'https://lettin.tuturuuu.com https://tuturuuu.com',
  'data:text/plain,opaque',
  'https://[invalid',
])('withholds grants for untrusted or nonserialized origin %j', (origin) => {
  const request = preflight(origin);
  expect(getProfileMediaUploadOrigin(request)).toBeNull();
  const response = profileMediaUploadOptions(request);
  expect(response.status).toBe(403);
  expect(response.headers.has('access-control-allow-origin')).toBe(false);
});

it('matches configured external origins by exact protocol, host and port', () => {
  vi.stubEnv(
    'NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS',
    'synthetic:https://external.example.test:8443'
  );
  const origin = 'https://external.example.test:8443';
  expect(getProfileMediaUploadOrigin(preflight(origin))).toBe(origin);
  for (const denied of [
    'http://external.example.test:8443',
    'https://external.example.test',
    'https://external.example.test:8444',
    'https://external.example.test.attacker.test:8443',
  ])
    expect(getProfileMediaUploadOrigin(preflight(denied))).toBeNull();
});

it('retains existing Vary values and does not add credentials or other grants', () => {
  const response = new Response('synthetic', {
    status: 409,
    headers: { Vary: 'Accept-Encoding, origin', 'Cache-Control': 'no-store' },
  });
  expect(withProfileMediaUploadCors(preflight(), response)).toBe(response);
  expect(response.status).toBe(409);
  expect(response.headers.get('vary')).toBe('Accept-Encoding, origin');
  expect(response.headers.get('access-control-allow-origin')).toBe(trusted);
  for (const name of [
    'access-control-allow-credentials',
    'access-control-allow-private-network',
    'access-control-allow-headers',
    'access-control-allow-methods',
  ])
    expect(response.headers.has(name)).toBe(false);
  const varied = withProfileMediaUploadCors(
    preflight(),
    new Response(null, { headers: { Vary: 'Accept-Encoding' } })
  );
  expect(varied.headers.get('vary')).toBe('Accept-Encoding, Origin');
});

it.each([null, 'https://attacker.test'])(
  'varies denied/no-origin PUT responses without grants: %j',
  (origin) => {
    const response = withProfileMediaUploadCors(
      preflight(origin),
      new Response()
    );
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  }
);

it.each([
  ['POST', 'content-type'],
  ['put', 'content-type'],
  [null, 'content-type'],
  ['PUT', 'authorization'],
  ['PUT', 'content-type, authorization'],
  ['PUT', 'x-custom'],
  ['PUT', 'content-type,'],
  ['PUT', ''],
])('denies disallowed requested method/header %j %j', (method, headers) => {
  const response = profileMediaUploadOptions(
    preflight(trusted, method, headers)
  );
  expect(response.status).toBe(403);
  expect(response.headers.has('access-control-allow-origin')).toBe(false);
  expect(response.headers.has('access-control-allow-methods')).toBe(false);
  expect(response.headers.has('access-control-allow-headers')).toBe(false);
});

it.each([avatarOptions, bannerOptions])(
  'explicit route OPTIONS is capability-independent and side-effect-free',
  (options) => {
    for (const token of ['', 'forged', 'expired-synthetic']) {
      const request = preflight(trusted, 'PUT', 'Content-Type', token);
      request.headers.set('Cookie', 'synthetic=ignored');
      request.headers.set('Access-Control-Request-Private-Network', 'true');
      const bodyRead = vi.spyOn(request, 'body', 'get');
      const urlRead = vi.spyOn(request, 'url', 'get');
      const response = options(request);
      expect(bodyRead).not.toHaveBeenCalled();
      expect(urlRead).not.toHaveBeenCalled();
      expect(response.status).toBe(204);
      expect(response.body).toBeNull();
      expect(response.headers.get('access-control-allow-origin')).toBe(trusted);
      expect(response.headers.get('access-control-allow-methods')).toBe('PUT');
      expect(response.headers.get('access-control-allow-headers')).toBe(
        'Content-Type'
      );
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('vary')).toBe(
        'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
      );
      expect(response.headers.has('access-control-allow-credentials')).toBe(
        false
      );
      expect(response.headers.has('access-control-allow-private-network')).toBe(
        false
      );
    }
    for (const effect of Object.values(effects))
      expect(effect).not.toHaveBeenCalled();
  }
);

it('allows PUT with no requested headers and never trusts forwarded hosts', () => {
  expect(
    profileMediaUploadOptions(preflight(trusted, 'PUT', null)).status
  ).toBe(204);
  const request = preflight('https://attacker.test');
  request.headers.set('X-Forwarded-Host', 'lettin.tuturuuu.com');
  expect(profileMediaUploadOptions(request).status).toBe(403);
});
