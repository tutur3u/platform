import type { MeetTranscriptConsent } from '@tuturuuu/internal-api';

/** What the server says about per-speaker capture for this room. */
export type SelfRoomView = {
  mode: 'room' | 'self';
  available: boolean;
  canManageMode: boolean;
  session: { sessionId: string; protocol: 'legacy' | 'self_v1' } | null;
  coverage: { accountId: string; contributing: boolean }[];
};

export const ROOM_ONLY: SelfRoomView = {
  mode: 'room',
  available: false,
  canManageMode: false,
  session: null,
  coverage: [],
};

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;

/**
 * Reads the optional per-speaker fields of the consent view. Anything missing
 * or malformed means room capture, so a client never captures by accident.
 */
export function readSelfRoom(
  consent: MeetTranscriptConsent | undefined
): SelfRoomView {
  const view = record(consent);
  if (!view || view.available !== true) return ROOM_ONLY;
  const session = record(view.session);
  const sessionId = session?.sessionId;
  const protocol = session?.protocol;
  return {
    mode: view.mode === 'self' ? 'self' : 'room',
    available: view.perSpeakerAvailable === true,
    canManageMode: view.canManageMode === true,
    session:
      typeof sessionId === 'string' &&
      (protocol === 'self_v1' || protocol === 'legacy')
        ? { sessionId, protocol }
        : null,
    coverage: Array.isArray(view.coverage)
      ? view.coverage.flatMap((entry: unknown) => {
          const row = record(entry);
          return typeof row?.accountId === 'string'
            ? [
                {
                  accountId: row.accountId,
                  contributing: row.contributing === true,
                },
              ]
            : [];
        })
      : [],
  };
}

/** A per-speaker session is the one running right now. */
export const isSelfSession = (room: SelfRoomView) =>
  room.mode === 'self' && room.session?.protocol === 'self_v1';
