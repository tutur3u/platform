import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayIntegrityVerifier } from './native-integrity-play';

const hash = Buffer.alloc(32, 1).toString('base64url');
const certificate = Buffer.alloc(32, 2).toString('base64url');
function payload() {
  return {
    tokenPayloadExternal: {
      requestDetails: {
        requestPackageName: 'com.example.app',
        requestHash: hash,
        timestampMillis: '1000000',
      },
      appIntegrity: {
        appRecognitionVerdict: 'PLAY_RECOGNIZED',
        packageName: 'com.example.app',
        certificateSha256Digest: [certificate],
      },
      deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
      accountDetails: { appLicensingVerdict: 'LICENSED' },
    },
  };
}
const fetchMock = vi.fn<typeof fetch>();
const access = vi.fn(async (_signal: AbortSignal) => 'fixture-access-token');
const verifier = () =>
  createPlayIntegrityVerifier({
    packageName: 'com.example.app',
    certificateDigests: [certificate],
    getAccessToken: access,
    fetch: fetchMock,
    now: () => 1000000,
  });
describe('Google server decode verifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation(async () => Response.json(payload()));
  });
  it('calls authenticated Google decode exactly once with bounded abort and no redirects', async () => {
    await verifier()({ token: 'integrity-token', requestHash: hash });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://playintegrity.googleapis.com/v1/com.example.app:decodeIntegrityToken',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        signal: expect.any(AbortSignal),
        headers: {
          Authorization: 'Bearer fixture-access-token',
          'Content-Type': 'application/json',
        },
      })
    );
    expect(access).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it.each([
    'requestPackage',
    'appPackage',
    'requestHash',
    'stale',
    'future',
    'appVerdict',
    'deviceVerdict',
    'license',
    'certificate',
  ])('rejects invalid %s', async (kind) => {
    const data = payload();
    const p = data.tokenPayloadExternal;
    if (kind === 'requestPackage')
      p.requestDetails.requestPackageName = 'com.attacker';
    if (kind === 'appPackage') p.appIntegrity.packageName = 'com.attacker';
    if (kind === 'requestHash') p.requestDetails.requestHash = 'wrong';
    if (kind === 'stale') p.requestDetails.timestampMillis = '879999';
    if (kind === 'future') p.requestDetails.timestampMillis = '1010001';
    if (kind === 'appVerdict')
      p.appIntegrity.appRecognitionVerdict = 'UNRECOGNIZED_VERSION';
    if (kind === 'deviceVerdict')
      p.deviceIntegrity.deviceRecognitionVerdict = ['MEETS_BASIC_INTEGRITY'];
    if (kind === 'license') p.accountDetails.appLicensingVerdict = 'UNLICENSED';
    if (kind === 'certificate') p.appIntegrity.certificateSha256Digest = [hash];
    fetchMock.mockImplementation(async () => Response.json(data));
    await expect(
      verifier()({ token: 'token', requestHash: hash })
    ).rejects.toThrow();
  });
  it('does not decode when OAuth acquisition fails and never retries it', async () => {
    const getAccessToken = vi.fn(
      async (_signal: AbortSignal): Promise<string> => {
        throw new Error('provider unavailable');
      }
    );
    const verify = createPlayIntegrityVerifier({
      packageName: 'com.example.app',
      certificateDigests: [certificate],
      getAccessToken,
      fetch: fetchMock,
    });
    await expect(
      verify({ token: 'token', requestHash: hash })
    ).rejects.toThrow();
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('aborts and drains a stalled response body within the shared decode deadline without retries', async () => {
    const cancelled = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(new ReadableStream({ pull() {}, cancel: cancelled }))
    );
    const verify = createPlayIntegrityVerifier({
      packageName: 'com.example.app',
      certificateDigests: [certificate],
      getAccessToken: access,
      fetch,
      timeoutMs: 20,
    });
    await expect(
      verify({ token: 'token', requestHash: hash })
    ).rejects.toThrow();
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects unavailable, malformed or oversized provider responses without retries', async () => {
    for (const response of [
      new Response('failure', { status: 503 }),
      Response.json(null),
      new Response('x'.repeat(65_537)),
    ]) {
      fetchMock.mockResolvedValue(response);
      const before = fetchMock.mock.calls.length;
      await expect(
        verifier()({ token: 'token', requestHash: hash })
      ).rejects.toThrow();
      expect(fetchMock.mock.calls.length).toBe(before + 1);
    }
  });
});
