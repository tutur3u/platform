import {
  createPrivateKey,
  createPublicKey,
  type KeyObject,
  sign,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  bindingBytes,
  ownerKeyId,
  ownerTranscript,
  REQUEST_DOMAIN,
} from './secret';

/**
 * Secret-entry test helpers built on the shared byte fixture
 * (scripts/mastermind-fleet/secret-fixture.json). Its seeds are disposable
 * test values; nothing here is a real key.
 */
export const secretFixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../scripts/mastermind-fleet/secret-fixture.json',
      import.meta.url
    ),
    'utf8'
  )
);

const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
export const signerFromSeed = (seedHex: string) =>
  createPrivateKey({
    key: Buffer.concat([PKCS8, Buffer.from(seedHex, 'hex')]),
    format: 'der',
    type: 'pkcs8',
  });
export const rawPublicKey = (key: KeyObject) =>
  createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32);
export const b64url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString('base64url');

export const machineSigner = signerFromSeed(secretFixture.machineSeedHex);
export const ownerSigner = signerFromSeed(secretFixture.ownerSeedHex);
export const OWNER_KEY = b64url(rawPublicKey(ownerSigner));
export const OWNER_KEY_ID = ownerKeyId(rawPublicKey(ownerSigner));
/** A second owner key, outside the default audience. */
export const strangerSigner = signerFromSeed('33'.repeat(32));

export const COMMAND = JSON.stringify({
  argv: ['/usr/bin/ssh', '-T', 'macstudio1', '--', "'sudo' '-S' '-p' ''"],
  remote: ['sudo', '-S', '-p', ''],
});

/** A machine-signed request decision expiring `ttlMs` after `createdAt`. */
export function secretRequestDecision(
  createdAt: Date,
  {
    id = 'secret-0123456789abcdef01234567',
    ttlMs = 10 * 60_000,
    audience = `${OWNER_KEY_ID},${'f'.repeat(32)}`,
    purpose = secretFixture.request.purpose as string,
    command = COMMAND,
  } = {}
) {
  const request = {
    v: '1' as const,
    requestId: id,
    machineId: 'skr-m4',
    requester: 'lane-0123456789abcdef',
    operation: 'studio-sudo',
    command,
    output: 'withheld' as const,
    purpose,
    expiresAt: new Date(createdAt.getTime() + ttlMs).toISOString(),
    publicKey: secretFixture.request.publicKey as string,
    signerKey: secretFixture.request.signerKey as string,
    audience,
  };
  return {
    id,
    kind: 'secret',
    title: purpose,
    urgency: 'urgent',
    createdAt: createdAt.toISOString(),
    secret: {
      mode: 'request' as const,
      ...request,
      sig: b64url(
        sign(null, bindingBytes(REQUEST_DOMAIN, request), machineSigner)
      ),
    },
  };
}

/** A pairing decision; the MAC is shape-only for Web. */
export function secretPairDecision(
  createdAt: Date,
  id = 'pair-0123456789abcdef01234567'
) {
  return {
    id,
    kind: 'secret',
    title: 'Pair Skora M4',
    urgency: 'urgent',
    createdAt: createdAt.toISOString(),
    secret: {
      mode: 'pair' as const,
      v: '1' as const,
      pairingId: id,
      machineId: 'skr-m4',
      machineLabel: secretFixture.pairing.machineLabel as string,
      signerKey: secretFixture.pairing.signerKey as string,
      expiresAt: new Date(createdAt.getTime() + 10 * 60_000).toISOString(),
      machineMac: secretFixture.pairing.machineMac as string,
    },
  };
}

type RequestDecision = ReturnType<typeof secretRequestDecision>;

/** An owner answer signed over the transcript of `decision`'s request. */
export function ownerAnswer(
  decision: RequestDecision,
  {
    action = 'secret',
    signer = ownerSigner,
    signedAt = decision.createdAt,
    keyId,
    enc = secretFixture.answer.enc as string,
    ct = secretFixture.answer.ct as string,
  }: {
    action?: 'secret' | 'decline';
    signer?: KeyObject;
    signedAt?: string;
    keyId?: string;
    enc?: string;
    ct?: string;
  } = {}
) {
  const publicKey = rawPublicKey(signer);
  const id = keyId ?? ownerKeyId(publicKey);
  const sealed = action === 'secret' ? { enc, ct } : { enc: '', ct: '' };
  const sig = sign(
    null,
    ownerTranscript(decision.secret, {
      action,
      ...sealed,
      signedAt,
      keyId: id,
    }),
    signer
  );
  return {
    action,
    ...(action === 'secret' ? { sealed: { enc, ct } } : {}),
    owner: {
      publicKey: b64url(publicKey),
      keyId: id,
      signedAt,
      sig: b64url(sig),
    },
  };
}
