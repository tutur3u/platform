import { createHash, createSign } from 'node:crypto';
import { z } from 'zod';

const credentialsSchema = z.object({
  client_email: z.string().email(),
  private_key: z.string().min(1),
  token_uri: z.literal('https://oauth2.googleapis.com/token').optional(),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().max(3600),
});
const endpoint = 'https://oauth2.googleapis.com/token';
let cached: { identity: string; token: string; expiresAt: number } | undefined;
let pending: { identity: string; promise: Promise<string> } | undefined;

function waitForCaller(
  promise: Promise<string>,
  signal?: AbortSignal
): Promise<string> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(
      (token) => {
        signal.removeEventListener('abort', abort);
        signal.aborted ? reject(signal.reason) : resolve(token);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}

export function googleIntegrityAccessToken(
  fetchImpl: typeof fetch = fetch,
  now = Date.now,
  callerSignal?: AbortSignal
): Promise<string> {
  if (callerSignal?.aborted) return Promise.reject(callerSignal.reason);
  const serialized = process.env.NATIVE_INTEGRITY_GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serialized)
    return Promise.reject(
      new Error('Google integrity credentials unavailable')
    );
  const identity = createHash('sha256').update(serialized).digest('hex');
  if (cached?.identity === identity && cached.expiresAt > now() + 60_000)
    return waitForCaller(Promise.resolve(cached.token), callerSignal);
  if (pending?.identity === identity)
    return waitForCaller(pending.promise, callerSignal);
  const signal = AbortSignal.any([
    AbortSignal.timeout(5000),
    ...(callerSignal ? [callerSignal] : []),
  ]);
  const promise = (async () => {
    signal.throwIfAborted();
    const credentials = credentialsSchema.parse(JSON.parse(serialized));
    const issuedAt = Math.floor(now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' })
    ).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/playintegrity',
        aud: endpoint,
        iat: issuedAt,
        exp: issuedAt + 300,
      })
    ).toString('base64url');
    const input = `${header}.${claims}`;
    const signature = createSign('RSA-SHA256')
      .update(input)
      .sign(credentials.private_key)
      .toString('base64url');
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${input}.${signature}`,
      }),
      signal,
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error('Google integrity authorization unavailable');
    }
    const reader = response.body.getReader();
    let canceled: Promise<void> | undefined;
    const cancel = () => {
      canceled ??= reader.cancel().catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        size += value.length;
        if (size > 16_384) {
          cancel();
          await canceled;
          throw new Error('Google authorization response too large');
        }
        chunks.push(value);
      }
    } finally {
      signal.removeEventListener('abort', cancel);
      if (signal.aborted) cancel();
      await canceled;
      reader.releaseLock();
    }
    signal.throwIfAborted();
    const token = tokenSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString('utf8'))
    );
    cached = {
      identity,
      token: token.access_token,
      expiresAt: now() + token.expires_in * 1000,
    };
    return token.access_token;
  })().finally(() => {
    if (pending?.identity === identity) pending = undefined;
  });
  pending = { identity, promise };
  return promise;
}
