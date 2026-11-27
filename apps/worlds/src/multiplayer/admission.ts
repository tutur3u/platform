const DOMAIN = 'tuturuuu.worlds.room-admission.v1.';
export const ADMISSION_TTL_SECONDS = 30;
export const ROOM_LEASE_SECONDS = 15 * 60;
const encoder = new TextEncoder();

export type RoomScope = { worldId: string; revision: string; shard: number };
export type RoomAdmission = RoomScope & {
  actorId: string;
  issuedAt: number;
  expiresAt: number;
  leaseUntil: number;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRoomScope(
  value: unknown
): value is RoomScope & Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.worldId === 'string' &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(value.worldId) &&
    typeof value.revision === 'string' &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(value.revision) &&
    typeof value.shard === 'number' &&
    Number.isInteger(value.shard) &&
    value.shard >= 0 &&
    value.shard < 16
  );
}

export function roomName(scope: RoomScope) {
  return `worlds:v1:${scope.worldId}:${scope.revision}:${scope.shard}`;
}

export function isActorId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function decode(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  const bytes = Uint8Array.from(
    atob(value.replaceAll('-', '+').replaceAll('_', '/')),
    (char) => char.charCodeAt(0)
  );
  if (base64Url(bytes) !== value) throw new Error('Invalid encoding');
  return bytes;
}

async function key(secret: string, usage: 'sign' | 'verify') {
  if (encoder.encode(secret).length < 32)
    throw new Error('Worlds admission key is missing or too short');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

/** The resolver owns session verification, access, published revision selection and session expiry. */
export async function issueRoomAdmission(
  scope: RoomScope,
  resolveAuthorizedActor: (
    scope: RoomScope
  ) => Promise<{ id: string; sessionExpiresAt: number } | null>,
  secret: string,
  clock = Date.now
) {
  if (!isRoomScope(scope)) return null;
  const { worldId, revision, shard } = scope;
  const target = { worldId, revision, shard };
  const actor = await resolveAuthorizedActor({ ...target });
  const issuedAt = Math.floor(clock() / 1000);
  if (
    !actor ||
    !isActorId(actor.id) ||
    !Number.isSafeInteger(actor.sessionExpiresAt) ||
    actor.sessionExpiresAt <= issuedAt
  )
    return null;

  const leaseUntil = Math.min(
    actor.sessionExpiresAt,
    issuedAt + ROOM_LEASE_SECONDS
  );
  const admission: RoomAdmission = {
    ...target,
    actorId: actor.id,
    issuedAt,
    expiresAt: Math.min(leaseUntil, issuedAt + ADMISSION_TTL_SECONDS),
    leaseUntil,
  };
  const payload = base64Url(encoder.encode(JSON.stringify(admission)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await key(secret, 'sign'),
    encoder.encode(DOMAIN + payload)
  );
  return `${payload}.${base64Url(new Uint8Array(signature))}`;
}

export async function verifyRoomAdmission(
  token: string,
  secret: string,
  clock = Date.now
): Promise<RoomAdmission | null> {
  if (token.length > 1024) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined || signature.length !== 43)
    return null;
  const verificationKey = await key(secret, 'verify');
  try {
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        verificationKey,
        decode(signature),
        encoder.encode(DOMAIN + payload)
      ))
    )
      return null;
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(decode(payload))
    );
    if (!isRecord(value) || !isRoomScope(value) || !isActorId(value.actorId))
      return null;
    const {
      actorId,
      worldId,
      revision,
      shard,
      issuedAt,
      expiresAt,
      leaseUntil,
    } = value;
    const now = Math.floor(clock() / 1000);
    if (
      typeof issuedAt !== 'number' ||
      !Number.isSafeInteger(issuedAt) ||
      typeof expiresAt !== 'number' ||
      !Number.isSafeInteger(expiresAt) ||
      typeof leaseUntil !== 'number' ||
      !Number.isSafeInteger(leaseUntil) ||
      issuedAt > now + 5 ||
      expiresAt <= now ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > ADMISSION_TTL_SECONDS ||
      leaseUntil < expiresAt ||
      leaseUntil - issuedAt > ROOM_LEASE_SECONDS
    )
      return null;
    return {
      actorId,
      worldId,
      revision,
      shard,
      issuedAt,
      expiresAt,
      leaseUntil,
    };
  } catch {
    return null;
  }
}
