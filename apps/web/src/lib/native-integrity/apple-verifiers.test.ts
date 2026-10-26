// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  factory: vi.fn(),
  attestIos: vi.fn(),
  attestMac: vi.fn(),
  assertIos: vi.fn(),
  assertMac: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/native-integrity', () => ({
  createAppleIntegrityVerifier: mocks.factory,
}));

import { configuredAppleVerifiers } from './apple-verifiers';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('selects an assertion verifier only from the persisted key platform', async () => {
  mocks.factory.mockImplementation(({ platform }) => ({
    attest: platform === 'ios' ? mocks.attestIos : mocks.attestMac,
    assert: platform === 'ios' ? mocks.assertIos : mocks.assertMac,
  }));
  mocks.assertMac.mockResolvedValue(2);
  await configuredAppleVerifiers().assert({
    platform: 'macos',
    assertion: 'proof',
    publicKey: 'public-key',
    counter: 1,
    requestHash: 'hash',
  });
  expect(mocks.factory).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ platform: 'macos' })
  );
  expect(mocks.assertMac).toHaveBeenCalledTimes(1);
  expect(mocks.assertIos).not.toHaveBeenCalled();
});
it('tries only explicitly configured app identities at enrollment', async () => {
  mocks.factory.mockImplementation(({ platform }) => ({
    attest: platform === 'ios' ? mocks.attestIos : mocks.attestMac,
    assert: platform === 'ios' ? mocks.assertIos : mocks.assertMac,
  }));
  mocks.attestIos.mockRejectedValue(new Error('not-ios'));
  mocks.attestMac.mockResolvedValue({
    platform: 'macos',
    publicKey: 'public-key',
    environment: 'production',
  });
  const verifier = configuredAppleVerifiers();
  await expect(
    verifier.attest({ attestation: 'proof', keyId: 'key', requestHash: 'hash' })
  ).rejects.toThrow();
  expect(mocks.attestMac).not.toHaveBeenCalled();
  vi.stubEnv('NATIVE_INTEGRITY_APPLE_MACOS_BUNDLE_ID', 'com.example.macos');
  expect(
    await verifier.attest({
      attestation: 'proof',
      keyId: 'key',
      requestHash: 'hash',
    })
  ).toMatchObject({ platform: 'macos' });
});
