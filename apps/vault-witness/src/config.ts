import { signingPublicKey } from '@tuturuuu/vault-crypto';
import type { Signer } from './vault-engine';

export type WitnessEnv = {
  readonly WITNESS_DEPLOYMENT?: string;
  readonly WITNESS_SIGNING_KEY?: string;
  readonly WITNESS_API_TOKEN?: string;
  readonly WITNESS_STOPPED?: string;
};

const KEY = /^([1-9][0-9]{0,8}):([A-Za-z0-9_-]{43})$/;

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * `WITNESS_SIGNING_KEY` is `<generation>:<base64url Ed25519 seed>`. Returns
 * null when it is missing or malformed, so the Worker fails closed.
 */
export function parseSigner(
  value: string | undefined
): (Signer & { publicKey: Uint8Array }) | null {
  const match = value ? KEY.exec(value) : null;
  if (!match) return null;
  const secretKey = fromBase64Url(match[2] as string);
  if (secretKey.length !== 32) return null;
  return {
    generation: Number(match[1]),
    secretKey,
    publicKey: signingPublicKey(secretKey),
  };
}

export function isStopped(env: WitnessEnv): boolean {
  return env.WITNESS_STOPPED === 'true';
}

export function deploymentOf(env: WitnessEnv): string | null {
  const d = env.WITNESS_DEPLOYMENT;
  return d && d.length <= 256 ? d : null;
}
