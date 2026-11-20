import 'server-only';

import { createHash, X509Certificate } from 'node:crypto';
import { verifyAndroidApprovalKeyAttestation } from '@tuturuuu/internal-api/native-integrity';
import { z } from 'zod';
import { configuredIosNativeIntegrityVerifier } from '../../native-integrity/apple-verifiers';
import { ANDROID_ATTESTATION_ROOTS } from './android-attestation-roots';
import { parseApprovalPublicKey } from './approval-signature';

const androidRoots = ANDROID_ATTESTATION_ROOTS.map(
  (pem) => new X509Certificate(pem)
);
const invalidAttestation = () =>
  new Error('Invalid mobile approval key attestation');

export const approvalKeyAttestationSchema = z.discriminatedUnion('platform', [
  z.object({
    platform: z.literal('android'),
    publicKey: z.string().length(124),
    securityLevel: z.enum(['tee', 'strongbox', 'hardware']),
    certificateChain: z.array(z.string().min(1).max(11_000)).min(2).max(8),
  }),
  z.object({
    platform: z.literal('ios'),
    publicKey: z.string().length(124),
    securityLevel: z.literal('secure_enclave'),
    attestationKeyId: z.string().min(1).max(48),
    attestation: z.string().min(1).max(33_000),
  }),
]);

const revocationListSchema = z.object({
  entries: z.record(
    z.string().regex(/^[a-f1-9][a-f0-9]*$/),
    z.object({ status: z.enum(['REVOKED', 'SUSPENDED']) })
  ),
});

let cached: { until: number; serials: ReadonlySet<string> } | undefined;
let pending: Promise<ReadonlySet<string>> | undefined;
async function loadAndroidRevocations() {
  const response = await fetch(
    'https://android.googleapis.com/attestation/status',
    {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!response.ok)
    throw new Error('Android attestation revocations unavailable');
  const { entries } = revocationListSchema.parse(await response.json());
  const serials = new Set(Object.keys(entries));
  const maxAge = Number(
    /(?:^|,\s*)max-age=(\d+)/i.exec(
      response.headers.get('cache-control') ?? ''
    )?.[1] ?? '0'
  );
  const age = Number(response.headers.get('age') ?? '0');
  const seconds = Number.isFinite(age)
    ? Math.max(0, Math.min(maxAge - age, 3600))
    : 0;
  cached = { until: Date.now() + seconds * 1000, serials };
  return serials;
}

function currentAndroidRevocations() {
  if (cached && cached.until > Date.now())
    return Promise.resolve(cached.serials);
  pending ??= loadAndroidRevocations().finally(() => {
    pending = undefined;
  });
  return pending;
}

export function iosApprovalAttestationHash(
  challenge: Buffer,
  publicKeyDer: Buffer
) {
  return createHash('sha256')
    .update('tuturuuu.mobile-approval.ios-attest.v2\0')
    .update(challenge)
    .update(publicKeyDer)
    .digest('base64url');
}

export async function verifyApprovalKeyAttestation(
  input: z.infer<typeof approvalKeyAttestationSchema>,
  challenge: Buffer
) {
  if (challenge.length !== 32) throw invalidAttestation();
  const { der } = parseApprovalPublicKey(input.publicKey);
  if (input.platform === 'ios') {
    await configuredIosNativeIntegrityVerifier({
      allowDevelopment: false,
    }).attest({
      keyId: input.attestationKeyId,
      attestation: input.attestation,
      requestHash: iosApprovalAttestationHash(challenge, der),
    });
    return 'secure_enclave' as const;
  }

  const packageName = process.env.MOBILE_APPROVAL_ANDROID_PACKAGE_NAME ?? '';
  const signingDigests = (
    process.env.MOBILE_APPROVAL_ANDROID_SIGNING_DIGESTS ?? ''
  )
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[0-9a-f]{64}$/.test(value));
  if (!packageName || !signingDigests.length) throw invalidAttestation();
  const securityLevel = verifyAndroidApprovalKeyAttestation({
    certificateChain: input.certificateChain,
    roots: androidRoots,
    revokedSerials: await currentAndroidRevocations(),
    publicKeyDer: der,
    challenge,
    packageName,
    signingDigests: new Set(signingDigests),
    minimumSecurityLevel:
      process.env.MOBILE_APPROVAL_ANDROID_REQUIRE_STRONGBOX === '1'
        ? 'strongbox'
        : 'tee',
  });
  if (
    input.securityLevel !== 'hardware' &&
    input.securityLevel !== securityLevel
  )
    throw invalidAttestation();
  return securityLevel;
}
