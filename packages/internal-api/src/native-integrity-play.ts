import { z } from 'zod';
import { decodeHash } from './native-integrity-binary';

const decodedSchema = z.object({
  tokenPayloadExternal: z.object({
    requestDetails: z.object({
      requestPackageName: z.string(),
      requestHash: z.string(),
      timestampMillis: z.string().regex(/^\d{1,16}$/),
    }),
    appIntegrity: z.object({
      appRecognitionVerdict: z.literal('PLAY_RECOGNIZED'),
      packageName: z.string(),
      certificateSha256Digest: z.array(z.string()).min(1).max(8),
    }),
    deviceIntegrity: z.object({
      deviceRecognitionVerdict: z.array(z.string()).min(1).max(8),
    }),
    accountDetails: z.object({ appLicensingVerdict: z.literal('LICENSED') }),
  }),
});
async function readBoundedJson(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<unknown> {
  if (!response.ok || !response.body)
    throw new Error('play-verification-unavailable');
  const reader = response.body.getReader();
  let cancellation: Promise<void> | undefined;
  const abort = () => {
    cancellation = reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('play-response-too-large');
      }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally {
    signal.removeEventListener('abort', abort);
    await cancellation;
    reader.releaseLock();
  }
}
export function createPlayIntegrityVerifier(config: {
  packageName: string;
  certificateDigests: readonly string[];
  getAccessToken: (signal: AbortSignal) => Promise<string>;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}) {
  if (
    !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(config.packageName) ||
    !config.certificateDigests.length
  )
    throw new Error('invalid-play-configuration');
  const certificates = new Set(
    config.certificateDigests.map((value) =>
      decodeHash(value).toString('base64url')
    )
  );
  return async (input: { token: string; requestHash: string }) => {
    if (!input.token || input.token.length > 16_384)
      throw new Error('invalid-play-token');
    decodeHash(input.requestHash);
    const signal = AbortSignal.timeout(
      Math.min(5000, Math.max(1, config.timeoutMs ?? 5000))
    );
    const accessToken = await config.getAccessToken(signal);
    if (!accessToken || /[\r\n]/.test(accessToken))
      throw new Error('invalid-play-credentials');
    const response = await (config.fetch ?? fetch)(
      `https://playintegrity.googleapis.com/v1/${config.packageName}:decodeIntegrityToken`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ integrityToken: input.token }),
        cache: 'no-store',
        redirect: 'error',
        signal,
      }
    );
    const { tokenPayloadExternal: payload } = decodedSchema.parse(
      await readBoundedJson(response, 65_536, signal)
    );
    const time = Number(payload.requestDetails.timestampMillis);
    const now = (config.now ?? Date.now)();
    if (
      payload.requestDetails.requestPackageName !== config.packageName ||
      payload.appIntegrity.packageName !== config.packageName ||
      payload.requestDetails.requestHash !== input.requestHash ||
      !Number.isSafeInteger(time) ||
      time > now + 10_000 ||
      now - time > 120_000 ||
      !payload.deviceIntegrity.deviceRecognitionVerdict.includes(
        'MEETS_DEVICE_INTEGRITY'
      )
    )
      throw new Error('invalid-play-verdict');
    if (
      !payload.appIntegrity.certificateSha256Digest.every((digest) =>
        certificates.has(decodeHash(digest).toString('base64url'))
      )
    )
      throw new Error('invalid-play-certificate');
  };
}
