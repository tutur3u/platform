import { chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decodeBase64,
  MAX_BASE64_LENGTH,
  MAX_RESPONSE_BYTES,
  SecretsClient,
} from './secrets-client';
import {
  loadCredentials,
  parseCredentials,
  SECRETS_ENDPOINT,
  type SecretsCredentials,
  SecretsCredentialsError,
} from './secrets-credentials';
import { createFakeVault, jsonResponse } from './secrets-test-fixtures';

const NOW = Date.parse('2026-10-25T00:00:00Z');
const credentials: SecretsCredentials = {
  version: 1,
  endpoint: SECRETS_ENDPOINT,
  workspaceId: '11111111-1111-4111-8111-111111111111',
  vaultId: '22222222-2222-4222-8222-222222222222',
  token: 'synthetic-token-AAAAAAAAAAAAAAAA',
  expiresAt: '2026-10-25T01:00:00Z',
};
const requestId = '33333333-3333-4333-8333-333333333333';
const client = (fetchImpl: typeof fetch, extra = {}) =>
  new SecretsClient({
    credentials,
    fetch: fetchImpl,
    now: () => NOW,
    ...extra,
  });

describe('request shape', () => {
  it('posts to the exact endpoint with redirect:error, no-store and a bearer', async () => {
    const vault = createFakeVault(credentials);
    await client(vault.fetch).put(
      'label one',
      Buffer.from('synthetic'),
      requestId
    );
    const [call] = vault.calls;
    expect(call?.url).toBe(`${SECRETS_ENDPOINT}/api/v1/secrets/operation`);
    expect(call?.init.method).toBe('POST');
    expect(call?.init.redirect).toBe('error');
    expect(call?.init.cache).toBe('no-store');
    expect(call?.init.credentials).toBe('omit');
    expect(call?.body).toMatchObject({
      workspaceId: credentials.workspaceId,
      vaultId: credentials.vaultId,
      requestId,
      action: 'put',
      name: 'label one',
      bytesBase64: Buffer.from('synthetic').toString('base64'),
    });
    expect(JSON.stringify(call?.init.headers)).not.toContain('synthetic"');
  });

  it('makes exactly one attempt and never retries a failed call', async () => {
    const vault = createFakeVault(credentials);
    vault.hooks.afterCommit = () => 'drop';
    const result = await client(vault.fetch).rotate(requestId);
    expect(result).toEqual({ kind: 'unknown', cause: 'network' });
    expect(vault.calls).toHaveLength(1);
  });

  it('maps a timeout to unknown', async () => {
    const vault = createFakeVault(credentials);
    vault.hooks.afterCommit = () => 'timeout';
    expect(await client(vault.fetch).rotate(requestId)).toEqual({
      kind: 'unknown',
      cause: 'timeout',
    });
  });

  it('refuses a call with expired credentials without sending anything', async () => {
    const vault = createFakeVault(credentials);
    const late = new SecretsClient({
      credentials,
      fetch: vault.fetch,
      now: () => NOW + 2 * 3600_000,
    });
    expect(await late.list()).toMatchObject({
      kind: 'rejected',
      code: 'credentials_expired',
    });
    expect(vault.calls).toHaveLength(0);
  });
});

describe('response handling', () => {
  const answer = (response: Response | (() => Response)) =>
    client((async () =>
      typeof response === 'function'
        ? response()
        : response) as unknown as typeof fetch);

  it('classifies 4xx {ok:false} as rejected and keeps only a safe code', async () => {
    const rejected = await answer(
      jsonResponse(
        { ok: false, code: 'rate_limited', retryAfterSeconds: 30 },
        429
      )
    ).rotate(requestId);
    expect(rejected).toEqual({
      kind: 'rejected',
      code: 'rate_limited',
      retryAfterSeconds: 30,
    });
    const odd = await answer(
      jsonResponse(
        { ok: false, code: 'Bad Code with synthetic-body-text!' },
        400
      )
    ).rotate(requestId);
    expect(odd).toEqual({
      kind: 'rejected',
      code: 'unrecognized_error',
      retryAfterSeconds: undefined,
    });
    expect(JSON.stringify(odd)).not.toContain('synthetic-body-text');
  });

  it('never treats 5xx, ambiguous codes or bodiless answers as a definitive refusal', async () => {
    for (const response of [
      jsonResponse({ ok: false, code: 'internal' }, 500),
      jsonResponse({ ok: false, code: 'request_in_progress' }, 409),
      jsonResponse({ ok: true, value: {} }, 500),
      new Response('', { status: 502 }),
    ]) {
      expect((await answer(response).rotate(requestId)).kind).toBe('unknown');
    }
  });

  it('treats malformed success bodies as unknown', async () => {
    const bad = [
      new Response('not json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      new Response('{"ok":true,"value":{}}', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
      jsonResponse({ ok: true }),
      jsonResponse({ ok: true, value: { requestId, revision: -1 } }),
      jsonResponse({
        ok: true,
        value: { requestId: 'someone-else', revision: 1 },
      }),
      jsonResponse([1, 2]),
    ];
    for (const response of bad)
      expect(await answer(response).rotate(requestId)).toMatchObject({
        kind: 'unknown',
        cause: 'malformed',
      });
  });

  it('refuses redirects, including a followed one reported by the response', async () => {
    const moved = new Response(null, {
      status: 302,
      headers: { location: 'https://evil.example/' },
    });
    expect(await answer(moved).rotate(requestId)).toEqual({
      kind: 'unknown',
      cause: 'redirect',
    });
    const followed = jsonResponse({
      ok: true,
      value: { requestId, revision: 1 },
    });
    Object.defineProperty(followed, 'redirected', { value: true });
    expect(await answer(followed).rotate(requestId)).toEqual({
      kind: 'unknown',
      cause: 'redirect',
    });
    const elsewhere = jsonResponse({
      ok: true,
      value: { requestId, revision: 1 },
    });
    Object.defineProperty(elsewhere, 'url', {
      value: 'https://evil.example/api/v1/secrets/operation',
    });
    expect(await answer(elsewhere).rotate(requestId)).toEqual({
      kind: 'unknown',
      cause: 'redirect',
    });
  });

  it('bounds the response size by header and by stream', async () => {
    const declared = new Response('{}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(MAX_RESPONSE_BYTES + 1),
      },
    });
    expect(await answer(declared).list()).toEqual({
      kind: 'unknown',
      cause: 'oversize',
    });
    const streamed = new Response(Buffer.alloc(MAX_RESPONSE_BYTES + 10, 0x61), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    expect(await answer(streamed).list()).toEqual({
      kind: 'unknown',
      cause: 'oversize',
    });
  });

  it('validates get responses: name echo, base64 and size', async () => {
    const wrongName = jsonResponse({
      ok: true,
      value: { name: 'other', bytesBase64: 'AAAA' },
    });
    expect((await answer(wrongName).get('wanted')).kind).toBe('unknown');
    for (const bytesBase64 of [
      '',
      'AAA',
      'AA=A',
      '@@@@',
      'A'.repeat(MAX_BASE64_LENGTH + 4),
    ]) {
      const response = jsonResponse({
        ok: true,
        value: { name: 'wanted', bytesBase64 },
      });
      expect(await answer(response).get('wanted')).toEqual({
        kind: 'unknown',
        cause: 'malformed',
      });
    }
  });

  it('validates list items and caps their count', async () => {
    const good = jsonResponse({
      ok: true,
      value: { items: [{ id: 'a1', name: 'one' }], revision: 4 },
    });
    expect(await answer(good).list()).toEqual({
      kind: 'ok',
      value: { items: [{ id: 'a1', name: 'one' }], revision: '4' },
    });
    const control = jsonResponse({
      ok: true,
      value: { items: [{ id: 'a1', name: 'bad\u001b[31m' }], revision: 1 },
    });
    expect((await answer(control).list()).kind).toBe('unknown');
    const many = jsonResponse({
      ok: true,
      value: {
        items: Array.from({ length: 1001 }, (_, i) => ({
          id: `i${i}`,
          name: 'n',
        })),
        revision: 1,
      },
    });
    expect((await answer(many).list()).kind).toBe('unknown');
  });

  it('round-trips an arbitrary binary value of 5 MiB', async () => {
    const vault = createFakeVault(credentials);
    const bytes = Buffer.from(
      Array.from({ length: 5 * 1024 * 1024 }, (_, i) => (i * 31 + 7) & 0xff)
    );
    expect((await client(vault.fetch).put('big', bytes, requestId)).kind).toBe(
      'ok'
    );
    const read = await client(vault.fetch).get('big');
    expect(read.kind === 'ok' && read.value.bytes.equals(bytes)).toBe(true);
  });
});

describe('decodeBase64', () => {
  it('decodes valid padded input and rejects everything else', () => {
    expect(decodeBase64('c3ludGhldGlj')?.toString()).toBe('synthetic');
    expect(decodeBase64('YQ==')?.toString()).toBe('a');
    for (const text of ['', 'YQ', 'YQ=', 'Y=Q=', 'YQ==YQ==', 'éééé'])
      expect(decodeBase64(text)).toBeUndefined();
  });
});

describe('credentials', () => {
  const text = (patch: Record<string, unknown> = {}) =>
    JSON.stringify({ ...credentials, ...patch });
  const options = { now: () => NOW };

  it('accepts the version 1 schema', () => {
    expect(parseCredentials(text(), options)).toEqual(credentials);
  });

  it('rejects expiry, wrong endpoints, bad ids/tokens and unknown keys', () => {
    const fail = (value: string, reason: string, o = options) => {
      try {
        parseCredentials(value, o);
      } catch (error) {
        expect((error as SecretsCredentialsError).reason).toBe(reason);
        expect((error as Error).message).not.toContain('synthetic-token');
        return;
      }
      throw new Error('accepted');
    };
    fail(text({ expiresAt: '2026-10-24T23:59:59Z' }), 'expired');
    fail(text({ expiresAt: '2026-10-25T00:00:00Z' }), 'expired');
    for (const endpoint of [
      'http://passwords.tuturuuu.com',
      'https://passwords.tuturuuu.com/',
      'https://passwords.tuturuuu.com:8443',
      'https://tuturuuu.com',
      'https://passwords.tuturuuu.com.evil.example',
      'http://127.0.0.1:3000',
      'http://localhost:3000',
    ])
      fail(text({ endpoint }), 'endpoint');
    fail(text({ version: 2 }), 'malformed');
    fail(text({ workspaceId: 'nope' }), 'malformed');
    fail(text({ vaultId: 7 }), 'malformed');
    fail(text({ token: 'short' }), 'malformed');
    fail(text({ token: 'synthetic-token\r\nX-Evil: 1AAAA' }), 'malformed');
    fail(text({ expiresAt: 'tomorrow' }), 'malformed');
    fail(text({ extra: 1 }), 'malformed');
    fail('[]', 'malformed');
    fail('{', 'malformed');
    const { token: _token, ...missing } = credentials;
    fail(JSON.stringify(missing), 'malformed');
  });

  it('allows a loopback endpoint only through the injected allow-list', () => {
    const loopback = text({ endpoint: 'http://127.0.0.1:4010' });
    expect(() => parseCredentials(loopback, options)).toThrow(
      SecretsCredentialsError
    );
    expect(
      parseCredentials(loopback, {
        ...options,
        allowedEndpoints: ['http://127.0.0.1:4010'],
      }).endpoint
    ).toBe('http://127.0.0.1:4010');
  });

  describe('from a file', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await realpath(await mkdtemp(join(tmpdir(), 'ttr-secrets-creds-')));
    });
    afterEach(() => rm(dir, { recursive: true, force: true }));

    it('loads an owner-only file and refuses a group-readable one', async () => {
      const file = join(dir, 'secrets.json');
      await writeFile(file, text(), { mode: 0o600 });
      expect(await loadCredentials(file, options)).toEqual(credentials);
      await chmod(file, 0o640);
      await expect(loadCredentials(file, options)).rejects.toThrow('chmod 600');
    });
  });
});

describe('real fetch redirect refusal', () => {
  it('refuses a 302 from a loopback server and never follows it', async () => {
    const hits: string[] = [];
    const server = createServer((request, response) => {
      hits.push(request.url ?? '');
      if (request.url === '/api/v1/secrets/operation') {
        response.writeHead(302, { location: '/stolen' });
      } else response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"ok":true,"value":{"items":[],"revision":1}}');
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const result = await new SecretsClient({
        credentials: { ...credentials, endpoint },
        now: () => NOW,
      }).rotate(requestId);
      expect(result.kind).toBe('unknown');
      expect(hits).toEqual(['/api/v1/secrets/operation']);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });
});
