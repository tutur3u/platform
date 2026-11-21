/** Test-only key guard signers and list builders. */
import { canonicalJson, encodeBase64Url, utf8 } from '../encoding';
import type { GuardPinKey } from '../control/guard-response';

export const ENV = 'production';
export const NOW = 1_800_000_000_000;

export type GuardSigner = Readonly<{
  keyId: string;
  pin: GuardPinKey;
  sign(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>>;
}>;

export async function createSigner(keyId: string): Promise<GuardSigner> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey)
  );
  return {
    keyId,
    pin: { keyId, publicKey: encodeBase64Url(raw) },
    sign: async (bytes) =>
      new Uint8Array(
        await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, bytes)
      ),
  };
}

export type ListFields = {
  env?: unknown;
  kids?: unknown;
  listVersion?: unknown;
  mintHalt?: unknown;
  gatewayVersions?: unknown;
  identityBlocked?: unknown;
  issuedAtMs?: unknown;
  [extra: string]: unknown;
};

export const listFields = (over: ListFields = {}): ListFields => ({
  env: ENV,
  kids: [],
  listVersion: 7,
  mintHalt: false,
  gatewayVersions: ['gw-b', 'gw-a'],
  identityBlocked: false,
  issuedAtMs: NOW,
  ...over,
});

/** Signs exactly `payloadText` and wraps it as the guard serves it. */
export async function signText(
  signer: GuardSigner,
  payloadText: string,
  keyId = signer.keyId
): Promise<string> {
  const bytes = utf8(payloadText);
  const sig = await signer.sign(bytes);
  return JSON.stringify({
    payload: encodeBase64Url(bytes),
    keyId,
    sig: encodeBase64Url(sig),
  });
}

/** Signs the canonical bytes of a list. */
export async function signList(
  signer: GuardSigner,
  over: ListFields = {}
): Promise<string> {
  const text = canonicalJson(listFields(over));
  if (text === undefined) throw new Error('fixture is not canonicalizable');
  return signText(signer, text);
}
