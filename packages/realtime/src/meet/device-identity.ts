/**
 * The connection id a signed-in member's call token carries when its client
 * sends no device id: the workspace realtime-token API used by mobile, or a
 * browser tab without storage. It is an HMAC of the account id with the
 * realtime secret, scoped to the room, so it
 *
 * - is stable across reconnects and token refreshes in one room, which keeps
 *   presence, stage, recording ownership and removal by device working;
 * - never equals the platform account id, which the token carries separately
 *   for the server's own account lookups;
 * - cannot be linked to the account, or across rooms, without the secret.
 *
 * Its input is domain-separated from the room account alias, so the two ids
 * never coincide. It keeps the UUID shape the presence schema requires.
 */
export async function meetAccountDeviceId(
  secret: string,
  roomId: string,
  accountId: string
): Promise<string> {
  const key = secret.trim();
  if (!key) throw new Error('Account device ids require a secret');
  const encoder = new TextEncoder();
  const hmac = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    hmac,
    encoder.encode(`meet-account-device:${roomId}:${accountId}`)
  );
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
