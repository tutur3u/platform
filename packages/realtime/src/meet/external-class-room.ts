import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { RoomServiceResult, RoomServiceState } from './room-service';

export const MEET_EXTERNAL_CLASS_SCOPE = 'meet:external-class';

const command = z.strictObject({
  action: z.enum(['external-class.initialize', 'external-class.status']),
});

export function applyExternalClassRoom(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  connected: ReadonlySet<string>
): RoomServiceResult | null {
  const parsed = command.safeParse(input);
  if (!parsed.success) return null;

  const owner = token.accountId ?? token.userId;
  if (
    token.role !== 'host' ||
    !token.scopes.includes('meet:server') ||
    !token.scopes.includes(MEET_EXTERNAL_CLASS_SCOPE) ||
    (state.lifecycle?.ownerAccountId &&
      state.lifecycle.ownerAccountId !== owner)
  ) {
    return { state, status: 403, body: { error: 'Forbidden' } };
  }

  if (parsed.data.action === 'external-class.status') {
    const live =
      state.externalClassInitialized === true &&
      !state.ended &&
      Object.entries(state.presence).some(
        ([id, person]) =>
          connected.has(id) &&
          person.role === 'host' &&
          (person.accountId ?? person.userId) === owner
      );
    return { state, body: { live } };
  }

  if (state.externalClassInitialized) return { state, body: { ready: true } };
  if (state.ended || state.lifecycle?.hadConnection || state.budget) {
    return { state, status: 409, body: { error: 'Room already used' } };
  }

  return {
    state: {
      ...state,
      externalClassInitialized: true,
      settings: {
        ...state.settings,
        allowAnonymousGuests: true,
        skipLobby: true,
      },
    },
    body: { ready: true },
  };
}
