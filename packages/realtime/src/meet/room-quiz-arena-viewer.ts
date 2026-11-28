import type { MeetRealtimeTokenPayload } from './primitives';
import type { ProjectedArenaTile, QuizArenaView } from './room-quiz-arena-view';
import {
  type MeetAccountAlias,
  seesMeetAccountIds,
} from './room-viewer-identity';

type Viewer = Pick<
  MeetRealtimeTokenPayload,
  'accountId' | 'admission' | 'guest' | 'role' | 'roomId' | 'userId'
>;

/**
 * The Quiz Arena view one participant receives. Players are keyed by account
 * id on the server, so scoring, buzz order and wagers stay correct there. A
 * viewer outside the workspace gets the room alias in place of every other
 * player's id, in the scoreboard and in each buzz queue alike, so a buzz still
 * matches its player. The viewer's own id stays, which is how its client finds
 * its own row and buzz. Managers keep real ids: judging and point changes
 * address players by them. Without an alias the id is left empty.
 */
export function quizArenaViewForViewer(
  view: QuizArenaView,
  viewer: Viewer,
  alias?: MeetAccountAlias
): QuizArenaView {
  if (view.kind === 'empty' || view.canManage || seesMeetAccountIds(viewer))
    return view;
  const own = viewer.accountId ?? viewer.userId;
  const id = (playerId: string) =>
    playerId === own ? playerId : (alias?.(viewer.roomId, playerId) ?? '');
  const tile = (entry: ProjectedArenaTile): ProjectedArenaTile => {
    const { answers: _managersOnly, ...rest } = entry;
    return {
      ...rest,
      buzzQueue: entry.buzzQueue.map((buzz) => ({
        ...buzz,
        userId: id(buzz.userId),
      })),
    };
  };
  return {
    ...view,
    tiles: view.tiles.map(tile),
    finalTile: view.finalTile ? tile(view.finalTile) : null,
    players: view.players.map((player) => ({
      ...player,
      userId: id(player.userId),
    })),
  };
}
