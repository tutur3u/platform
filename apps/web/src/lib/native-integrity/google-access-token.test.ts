// @vitest-environment node
import { generateKeyPairSync, verify } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { googleIntegrityAccessToken } from './google-access-token';

afterEach(() => vi.unstubAllEnvs());
it('signs the scoped Google OAuth assertion, bounds the fetch and coalesces access-token issuance', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  vi.stubEnv(
    'NATIVE_INTEGRITY_GOOGLE_SERVICE_ACCOUNT_JSON',
    JSON.stringify({
      client_email: 'fixture@example.test',
      private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }),
      token_uri: 'https://oauth2.googleapis.com/token',
    })
  );
  const network = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ access_token: 'synthetic-token', expires_in: 3600 })
    );
  expect(
    await Promise.all([
      googleIntegrityAccessToken(network, () => 1_800_000_000_000),
      googleIntegrityAccessToken(network, () => 1_800_000_000_000),
    ])
  ).toEqual(['synthetic-token', 'synthetic-token']);
  expect(network).toHaveBeenCalledTimes(1);
  const call = network.mock.calls[0];
  expect(call?.[0]).toBe('https://oauth2.googleapis.com/token');
  expect(call?.[1]?.redirect).toBe('error');
  expect(call?.[1]?.signal).toBeInstanceOf(AbortSignal);
  const form = new URLSearchParams(String(call?.[1]?.body));
  const jwt = form.get('assertion')?.split('.') ?? [];
  expect(
    verify(
      'RSA-SHA256',
      Buffer.from(`${jwt[0]}.${jwt[1]}`),
      publicKey,
      Buffer.from(jwt[2] ?? '', 'base64url')
    )
  ).toBe(true);
  expect(
    JSON.parse(Buffer.from(jwt[1] ?? '', 'base64url').toString())
  ).toMatchObject({
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/playintegrity',
  });
});
it('does not accept a credential-specified alternate token endpoint or retry a failed fetch', async () => {
  vi.stubEnv(
    'NATIVE_INTEGRITY_GOOGLE_SERVICE_ACCOUNT_JSON',
    JSON.stringify({
      client_email: 'fixture@example.test',
      private_key: 'invalid',
      token_uri: 'https://evil.example/token',
    })
  );
  const network = vi.fn<typeof fetch>();
  await expect(googleIntegrityAccessToken(network)).rejects.toThrow();
  expect(network).not.toHaveBeenCalled();
});
it('cancels and drains a stalled OAuth body when the caller deadline aborts, with one dispatch', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  vi.stubEnv(
    'NATIVE_INTEGRITY_GOOGLE_SERVICE_ACCOUNT_JSON',
    JSON.stringify({
      client_email: 'stalled@example.test',
      private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }),
    })
  );
  let reading: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    reading = resolve;
  });
  const cancel = vi.fn(async () => {});
  const body = new ReadableStream<Uint8Array>(
    {
      pull: () => {
        reading();
      },
      cancel,
    },
    { highWaterMark: 0 }
  );
  const network = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
  const caller = new AbortController();
  const operation = googleIntegrityAccessToken(
    network,
    Date.now,
    caller.signal
  );
  const rejected = expect(operation).rejects.toThrow('caller deadline');
  await started;
  caller.abort(new Error('caller deadline'));
  await rejected;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(network).toHaveBeenCalledTimes(1);
  expect(network.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});
it('honors an aborted coalesced caller without abandoning the active shared token refresh', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  vi.stubEnv(
    'NATIVE_INTEGRITY_GOOGLE_SERVICE_ACCOUNT_JSON',
    JSON.stringify({
      client_email: 'coalesced@example.test',
      private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }),
    })
  );
  let finish: (response: Response) => void = () => {};
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const network = vi.fn<typeof fetch>().mockReturnValue(response);
  const first = googleIntegrityAccessToken(network);
  const caller = new AbortController();
  const second = googleIntegrityAccessToken(network, Date.now, caller.signal);
  const rejected = expect(second).rejects.toThrow('second caller expired');
  caller.abort(new Error('second caller expired'));
  await rejected;
  finish(
    Response.json({
      access_token: 'retained-synthetic-token',
      expires_in: 3600,
    })
  );
  expect(await first).toBe('retained-synthetic-token');
  expect(network).toHaveBeenCalledTimes(1);
  await expect(
    googleIntegrityAccessToken(network, Date.now, caller.signal)
  ).rejects.toThrow('second caller expired');
  expect(network).toHaveBeenCalledTimes(1);
  const cachedCaller = new AbortController();
  const cachedRequest = googleIntegrityAccessToken(
    network,
    Date.now,
    cachedCaller.signal
  );
  const cachedRejected = expect(cachedRequest).rejects.toThrow(
    'cached caller expired'
  );
  cachedCaller.abort(new Error('cached caller expired'));
  await cachedRejected;
  expect(network).toHaveBeenCalledTimes(1);
});
