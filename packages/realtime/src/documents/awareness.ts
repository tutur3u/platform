import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

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
/** Bind cursor identity and client ID to the authenticated socket, ignoring peer relays. */
export function normalizeAwarenessUpdate(
  update: Uint8Array,
  userId: string,
  knownClientId?: number
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
  if (own.state)
    own.state = {
      ...own.state,
      user: {
        ...(own.state.user && typeof own.state.user === 'object'
          ? own.state.user
          : {}),
        id: userId,
      },
    };
  return { clientId: own.clientId, clock: own.clock, update: encode(own) };
}
export function awarenessRemoval(clientId: number, clock: number) {
  return encode({ clientId, clock: clock + 1, state: null });
}
