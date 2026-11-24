/** Hashing, encoding and signature checks of the fleet bridge Durable Object. */
import { bridgeAckSigningString } from '@tuturuuu/utils/mastermind-store/bridge-protocol';

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));

function fromBase64Url(text: string) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Ed25519 check of an acknowledgement under the key stored with its reply. */
export async function verifyAck(
  ackKey: string,
  signature: string,
  ack: Parameters<typeof bridgeAckSigningString>[0]
) {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      fromBase64Url(ackKey),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      fromHex(signature),
      new TextEncoder().encode(bridgeAckSigningString(ack))
    );
  } catch {
    return false;
  }
}

export function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

const DEFAULT_DAILY_OPS = 20_000;
const MAX_DAILY_OPS = 1_000_000;

/** Billable bridge operations per UTC day; null when misconfigured. */
export function bridgeBudget(raw: string | undefined) {
  if (!raw?.trim()) return DEFAULT_DAILY_OPS;
  if (!/^\d{1,7}$/u.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value > 0 && value <= MAX_DAILY_OPS ? value : null;
}
