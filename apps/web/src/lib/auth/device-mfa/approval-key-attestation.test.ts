import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  iosApprovalAttestationHash,
  verifyApprovalKeyAttestation,
} from './approval-key-attestation';

vi.mock('server-only', () => ({}));

const { attest } = vi.hoisted(() => ({ attest: vi.fn() }));
vi.mock('../../native-integrity/apple-verifiers', () => ({
  configuredIosNativeIntegrityVerifier: ({
    allowDevelopment,
  }: {
    allowDevelopment: boolean;
  }) => {
    expect(allowDevelopment).toBe(false);
    return { attest };
  },
}));

const challenge = Buffer.alloc(32, 1);

beforeEach(() => {
  attest.mockReset().mockResolvedValue({ platform: 'ios' });
});

it('binds iOS production App Attest to the exact approval public key and enrollment challenge', async () => {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const der = publicKey.export({ type: 'spki', format: 'der' });
  const proof = {
    platform: 'ios',
    securityLevel: 'secure_enclave',
    publicKey: der.toString('base64'),
    attestation: 'synthetic-attestation',
    attestationKeyId: 'synthetic-key-id',
  } as const;
  const expectedHash = iosApprovalAttestationHash(challenge, der);
  attest.mockImplementation(async ({ requestHash }) => {
    if (requestHash !== expectedHash)
      throw new Error('App Attest nonce mismatch');
  });

  await expect(verifyApprovalKeyAttestation(proof, challenge)).resolves.toBe(
    'secure_enclave'
  );
  expect(attest).toHaveBeenCalledWith({
    attestation: proof.attestation,
    keyId: proof.attestationKeyId,
    requestHash: expectedHash,
  });

  const other = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  }).publicKey;
  await expect(
    verifyApprovalKeyAttestation(
      {
        ...proof,
        publicKey: other
          .export({ type: 'spki', format: 'der' })
          .toString('base64'),
      },
      challenge
    )
  ).rejects.toThrow('App Attest nonce mismatch');
  await expect(
    verifyApprovalKeyAttestation(proof, Buffer.alloc(32, 2))
  ).rejects.toThrow('App Attest nonce mismatch');
});
