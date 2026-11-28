import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import {
  MIRA_AWARENESS_CLIENT_ID,
  MIRA_RESERVED_AWARENESS_KEYS,
} from './mira-presence';

type Entry = {
  clientId: number;
  clock: number;
  state: Record<string, unknown> | null;
};
function encode(entry: Entry) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 1);
  encoding.writeVarUint(encoder, entry.clientId);
  encoding.writeVarUint(encoder, entry.clock);
  encoding.writeVarString(encoder, JSON.stringify(entry.state));
  return encoding.toUint8Array(encoder);
}
const USER_KEYS = ['name', 'color'] as const;
/** The cursor identity fields a restricted room relays: name and color. */
export function allowedCursorUser(value: unknown) {
  const user: Record<string, string> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return user;
  for (const key of USER_KEYS) {
    const field = (value as Record<string, unknown>)[key];
    if (typeof field === 'string') user[key] = field.slice(0, 120);
  }
  return user;
}
function withoutReserved(value: Record<string, unknown>) {
  const next = { ...value };
  for (const key of MIRA_RESERVED_AWARENESS_KEYS) delete next[key];
  return next;
}
/**
 * Bind cursor identity and client ID to the authenticated socket, ignoring
 * peer relays. Mira's reserved client and identity keys are server-only.
 */
export function normalizeAwarenessUpdate(
  update: Uint8Array,
  userId: string,
  knownClientId?: number,
  /**
   * Relay only `user` (id, name, color) and `cursor`: rooms that people
   * outside the workspace join must not carry arbitrary client fields.
   */
  restricted = false
) {
  if (update.byteLength > 16384) throw new Error('Awareness exceeds limit');
  const decoder = decoding.createDecoder(update);
  const count = decoding.readVarUint(decoder);
  if (count > 128) throw new Error('Too many awareness clients');
  let own: Entry | null = null;
  for (let index = 0; index < count; index++) {
    const clientId = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    const state: unknown = JSON.parse(decoding.readVarString(decoder));
    if (state !== null && (typeof state !== 'object' || Array.isArray(state)))
      throw new Error('Invalid awareness state');
    const candidate = state as Record<string, unknown> | null;
    const identity = candidate?.user as { id?: unknown } | undefined;
    if (
      knownClientId === undefined
        ? identity?.id === userId || count === 1
        : clientId === knownClientId
    )
      own ??= { clientId, clock, state: candidate };
  }
  if (!own) return null;
  if (own.clientId === MIRA_AWARENESS_CLIENT_ID)
    throw new Error('Reserved awareness client');
  if (own.state && restricted)
    own.state = {
      ...('cursor' in own.state ? { cursor: own.state.cursor } : {}),
      user: { ...allowedCursorUser(own.state.user), id: userId },
    };
  else if (own.state)
    own.state = {
      ...withoutReserved(own.state),
      user: {
        ...(own.state.user &&
        typeof own.state.user === 'object' &&
        !Array.isArray(own.state.user)
          ? withoutReserved(own.state.user as Record<string, unknown>)
          : {}),
        id: userId,
      },
    };
  return { clientId: own.clientId, clock: own.clock, update: encode(own) };
}
export function awarenessRemoval(clientId: number, clock: number) {
  return encode({ clientId, clock: clock + 1, state: null });
}
