import { z } from 'zod';
import type { MeetClassFeatures } from './class-features';
import type { MeetRealtimeTokenPayload } from './primitives';
import { applyRoomRestore } from './room-lifecycle';
import type { RoomServiceResult, RoomServiceState } from './room-service';

export const MEET_EXTERNAL_CLASS_SCOPE = 'meet:external-class';

const command = z.strictObject({
  action: z.enum(['external-class.initialize', 'external-class.status']),
});

export function applyExternalClassRoom(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  connected: ReadonlySet<string>,
  features?: MeetClassFeatures
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
      !state.ended &&
      Object.entries(state.presence).some(
        ([id, person]) =>
          connected.has(id) &&
          person.role === 'host' &&
          (person.accountId ?? person.userId) === owner
      );
    return { state, body: { live } };
  }

  if (state.ended) {
    const restored = applyRoomRestore(
      state,
      token,
      {
        action: 'room.restore',
        expectedVersion: state.lifecycle?.version ?? 0,
      },
      Date.now(),
      features
    );
    return restored && !restored.status
      ? {
          state: { ...restored.state, externalClassInitialized: true },
          body: { ready: true },
        }
      : { state, body: { ready: false } };
  }

  if (state.externalClassInitialized) return { state, body: { ready: true } };
  if (state.lifecycle?.hadConnection || state.budget) {
    return {
      state: { ...state, externalClassInitialized: true },
      body: { ready: true },
    };
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
