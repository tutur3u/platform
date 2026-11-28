import type { MeetRealtimeServerMessage } from './messages';
import type { MeetRealtimeTokenPayload } from './primitives';

/**
 * Maps a platform account id to the opaque id one room shows outside viewers.
 * Returning undefined omits the id instead.
 */
export type MeetAccountAlias = (
  roomId: string,
  accountId: string
) => string | undefined;

type Viewer = Pick<
  MeetRealtimeTokenPayload,
  'accountId' | 'admission' | 'guest' | 'role' | 'roomId'
>;

/**
 * Whether a viewer may read other people's platform account ids. The host and
 * workspace members join with open admission and see them; anonymous guests and
 * signed-in people outside the workspace join through the lobby and do not.
 */
export function seesMeetAccountIds(viewer: Viewer) {
  return (
    viewer.role === 'host' || (!viewer.guest && viewer.admission !== 'lobby')
  );
}

function withAccount<
  K extends 'accountId' | 'ownerId',
  T extends { [P in K]?: string },
>(entry: T, key: K, viewer: Viewer, alias: MeetAccountAlias | undefined): T {
  const id = entry[key] as string | undefined;
  // A viewer always keeps its own id; its other devices then still match it.
  if (!id || id === viewer.accountId) return entry;
  const opaque = alias?.(viewer.roomId, id);
  if (opaque && opaque !== id) return { ...entry, [key]: opaque };
  const { [key]: _hidden, ...rest } = entry;
  return rest as unknown as T;
}

/**
 * The frame one viewer receives. Members get the frame unchanged. For anyone
 * else, every presence, chat and Mira Live owner account id other than their
 * own is replaced by the room alias, or omitted when no alias is available.
 * Server state keeps the real ids; only the wire copy changes.
 */
export function meetFrameForViewer(
  message: MeetRealtimeServerMessage,
  viewer: Viewer,
  alias?: MeetAccountAlias
): MeetRealtimeServerMessage {
  if (seesMeetAccountIds(viewer)) return message;
  switch (message.type) {
    case 'presence':
      return {
        ...message,
        presence: message.presence.map((p) =>
          withAccount(p, 'accountId', viewer, alias)
        ),
      };
    case 'presence.delta':
      return {
        ...message,
        upserted: message.upserted.map((p) =>
          withAccount(p, 'accountId', viewer, alias)
        ),
      };
    case 'chat.message':
      return withAccount(message, 'accountId', viewer, alias);
    // Clients keep the owner only to mirror the room; none reads it.
    case 'assistant.live':
      return withAccount(message, 'ownerId', viewer, alias);
    default:
      return message;
  }
}

/** Frames whose wire form depends on who receives them. */
export const isMeetViewerScopedFrame = (message: { type: string }) =>
  message.type === 'presence' ||
  message.type === 'presence.delta' ||
  message.type === 'chat.message' ||
  message.type === 'assistant.live';
