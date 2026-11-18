import type {
  ArenaAnswer,
  ArenaBuzz,
  ArenaPhase,
  ArenaTile,
  ArenaTileStatus,
  RoomQuizArenaState,
} from './room-quiz-arena-schema';
import {
  arenaWagerKey,
  attendanceCredited,
  playedArenaRounds,
  rankArenaEntries,
} from './room-quiz-arena-scoring';

export type QuizArenaMeta = {
  title: string;
  source: 'manual' | 'mira' | 'upskii' | 'starter';
  pickedBy: 'host' | 'mira' | null;
  categories: string[];
  finalCategory: string | null;
  tierPoints: number[];
  answerMode: 'buzz_in' | 'all_answer';
  playMode: 'individual' | 'teams';
  speedBonus: boolean;
  wrongAnswerPenalty: 'none' | 'half' | 'full';
  phase: ArenaPhase;
  activeTileId: string | null;
  buzzersLocked: boolean;
  playedRounds: number;
};

export type ProjectedArenaTile = {
  id: string;
  categoryIndex: number;
  tierIndex: number;
  points: number;
  isBonusWager: boolean;
  isFinal: boolean;
  status: ArenaTileStatus;
  openedAt: number | null;
  timeLimitSec: number;
  question: {
    type: 'single_choice' | 'open_text';
    question: string;
    options?: Array<{ id: string; label: string }>;
  } | null;
  reveal: {
    correctOptionIds: string[];
    acceptedAnswers: string[];
    explanation: string | null;
  } | null;
  answerCount: number;
  wagerCount: number;
  /** Teams that locked a wager; amounts stay private. */
  wageredTeamIds: string[];
  buzzQueue: Array<ArenaBuzz & { displayName: string }>;
  myAnswer: ArenaAnswer | null;
  myWager: number | null;
  myResult: { correct: boolean | null; delta: number } | null;
  results: {
    correctCount: number;
    tally: Array<{ optionId: string; count: number }>;
  } | null;
  answers?: Array<{
    userId: string;
    displayName: string;
    answer: ArenaAnswer;
    correct: boolean | null;
    delta: number;
    wager: number | null;
  }>;
};

export type ProjectedArenaPlayer = {
  userId: string;
  displayName: string;
  teamId: string | null;
  score: number;
  lastDelta: number;
  participatedRounds: number;
  attendanceCredited: boolean;
};
export type ProjectedArenaTeam = {
  id: string;
  name: string;
  score: number;
  lastDelta: number;
  memberCount: number;
};

type ViewBase = { epoch: string; seq: number; canManage: boolean };
export type QuizArenaFullView = ViewBase & {
  kind: 'full';
  meta: QuizArenaMeta;
  tiles: ProjectedArenaTile[];
  finalTile: ProjectedArenaTile | null;
  players: ProjectedArenaPlayer[];
  teams: ProjectedArenaTeam[];
};
export type QuizArenaDeltaView = ViewBase & {
  kind: 'delta';
  meta: QuizArenaMeta | null;
  tiles: ProjectedArenaTile[];
  finalTile: ProjectedArenaTile | null;
  players: ProjectedArenaPlayer[];
  teams: ProjectedArenaTeam[];
};
export type QuizArenaEmptyView = { kind: 'empty'; canManage: boolean };
export type QuizArenaView =
  | QuizArenaFullView
  | QuizArenaDeltaView
  | QuizArenaEmptyView;

function arenaMeta(state: RoomQuizArenaState): QuizArenaMeta {
  return {
    title: state.title,
    source: state.source,
    pickedBy: state.pickedBy,
    categories: state.categories,
    finalCategory: state.finalCategory ?? null,
    tierPoints: state.tierPoints,
    answerMode: state.config.answerMode,
    playMode: state.config.playMode,
    speedBonus: state.config.speedBonus,
    wrongAnswerPenalty: state.config.wrongAnswerPenalty,
    phase: state.phase,
    activeTileId: state.activeTileId,
    buzzersLocked: state.buzzersLocked,
    playedRounds: playedArenaRounds(state),
  };
}

/** Bonus questions stay hidden until the player's (or team's) wager is in. */
function questionVisible(
  state: RoomQuizArenaState,
  tile: ArenaTile,
  userId: string
) {
  if (tile.status === 'revealed') return true;
  if (tile.isFinal) return state.phase === 'final_answer';
  if (tile.status !== 'active') return false;
  return !tile.isBonusWager || arenaWagerKey(state, userId) in tile.wagers;
}

/** Answer keys stay secret until the tile is revealed or the game ends. */
function keyVisible(state: RoomQuizArenaState, tile: ArenaTile) {
  return (
    tile.status === 'revealed' ||
    (state.phase === 'ended' && tile.status !== 'available')
  );
}

export function projectArenaTile(
  state: RoomQuizArenaState,
  tile: ArenaTile,
  userId: string,
  canManage: boolean
): ProjectedArenaTile {
  const { question } = tile;
  const showQuestion = canManage || questionVisible(state, tile, userId);
  const wagerKey = arenaWagerKey(state, userId);
  const showKey = canManage || keyVisible(state, tile);
  const revealed = tile.status === 'revealed';
  const mine = tile.submissions.find((entry) => entry.userId === userId);
  const name = (id: string) => state.players[id]?.displayName ?? '';
  const tally = new Map(question.options?.map(({ id }) => [id, 0]) ?? []);
  for (const { answer } of tile.submissions)
    if ('optionId' in answer)
      tally.set(answer.optionId, (tally.get(answer.optionId) ?? 0) + 1);
  return {
    id: tile.id,
    categoryIndex: tile.categoryIndex,
    tierIndex: tile.tierIndex,
    points: tile.points,
    // Bonus tiles stay a surprise until they are picked.
    isBonusWager:
      canManage || tile.status !== 'available' ? tile.isBonusWager : false,
    isFinal: tile.isFinal,
    status: tile.status,
    openedAt: tile.openedAt ?? null,
    timeLimitSec: question.quizMeta.timeLimitSec,
    question: showQuestion
      ? {
          type: question.type,
          question: question.question,
          ...(question.options ? { options: question.options } : {}),
        }
      : null,
    reveal: showKey
      ? {
          correctOptionIds: question.quizMeta.correctOptionIds ?? [],
          acceptedAnswers: question.acceptedAnswers ?? [],
          explanation: question.quizMeta.explanation ?? null,
        }
      : null,
    answerCount: tile.submissions.length,
    wagerCount: Object.keys(tile.wagers).length,
    wageredTeamIds: Object.keys(tile.wagers)
      .filter((key) => key.startsWith('team:'))
      .map((key) => key.slice(5)),
    buzzQueue: tile.buzzQueue.map((buzz) => ({
      ...buzz,
      displayName: name(buzz.userId),
    })),
    myAnswer: mine?.answer ?? null,
    myWager: tile.wagers[wagerKey] ?? null,
    myResult:
      revealed && (mine || userId in tile.awards)
        ? { correct: mine?.correct ?? null, delta: tile.awards[userId] ?? 0 }
        : null,
    results: revealed
      ? {
          correctCount: tile.submissions.filter(({ correct }) => correct)
            .length,
          tally: [...tally].map(([optionId, count]) => ({ optionId, count })),
        }
      : null,
    ...(canManage
      ? {
          answers: tile.submissions.map((entry) => ({
            userId: entry.userId,
            displayName: name(entry.userId),
            answer: entry.answer,
            correct: entry.correct,
            delta: tile.awards[entry.userId] ?? 0,
            wager: tile.wagers[arenaWagerKey(state, entry.userId)] ?? null,
          })),
        }
      : {}),
  };
}

function projectPlayers(state: RoomQuizArenaState, sinceSeq: number) {
  return Object.values(state.players)
    .filter(({ v }) => v > sinceSeq)
    .map((player): ProjectedArenaPlayer => ({
      userId: player.userId,
      displayName: player.displayName,
      teamId: player.teamId ?? null,
      score: player.score,
      lastDelta: player.lastDelta,
      participatedRounds: player.participatedRounds,
      attendanceCredited: attendanceCredited(state, player),
    }));
}

function projectTeams(state: RoomQuizArenaState, sinceSeq: number) {
  const counts = new Map<string, number>();
  for (const { teamId } of Object.values(state.players))
    if (teamId) counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
  return state.teams
    .filter(({ v }) => v > sinceSeq)
    .map((team) => ({
      id: team.id,
      name: team.name,
      score: team.score,
      lastDelta: team.lastDelta,
      memberCount: counts.get(team.id) ?? 0,
    }));
}

/**
 * Compact incremental payload: only entities whose version moved after
 * `sinceSeq`. Revealing a round bumps every player row because attendance
 * credit depends on the played-round count.
 */
export function computeQuizArenaDelta(
  state: RoomQuizArenaState,
  sinceSeq: number,
  userId = '',
  canManage = false
): QuizArenaDeltaView {
  const metaChanged = state.metaV > sinceSeq;
  return {
    kind: 'delta',
    epoch: state.epoch,
    seq: state.seq,
    canManage,
    meta: metaChanged ? arenaMeta(state) : null,
    tiles: state.tiles
      .filter(({ v }) => v > sinceSeq)
      .map((tile) => projectArenaTile(state, tile, userId, canManage)),
    finalTile:
      state.finalTile && state.finalTile.v > sinceSeq
        ? projectArenaTile(state, state.finalTile, userId, canManage)
        : null,
    players: projectPlayers(state, sinceSeq),
    teams: projectTeams(state, sinceSeq),
  };
}

export function projectQuizArenaForUser(
  state: RoomQuizArenaState | undefined,
  userId: string,
  canManage: boolean,
  sinceSeq?: number
): QuizArenaView {
  if (!state) return { kind: 'empty', canManage };
  if (
    sinceSeq !== undefined &&
    sinceSeq >= state.baseSeq &&
    sinceSeq <= state.seq
  )
    return computeQuizArenaDelta(state, sinceSeq, userId, canManage);
  return {
    kind: 'full',
    epoch: state.epoch,
    seq: state.seq,
    canManage,
    meta: arenaMeta(state),
    tiles: state.tiles.map((tile) =>
      projectArenaTile(state, tile, userId, canManage)
    ),
    finalTile: state.finalTile
      ? projectArenaTile(state, state.finalTile, userId, canManage)
      : null,
    players: projectPlayers(state, -1),
    teams: projectTeams(state, -1),
  };
}

const upsert = <T>(current: T[], next: T[], key: (item: T) => string) => {
  if (!next.length) return current;
  const byKey = new Map(current.map((item) => [key(item), item]));
  for (const item of next) byKey.set(key(item), item);
  return [...byKey.values()];
};

/**
 * Merges a server view into the client's last full view. Returns `null`
 * when a delta cannot apply, so the caller refetches a full view.
 */
export function mergeQuizArenaView(
  previous: QuizArenaView | undefined,
  next: QuizArenaView
): QuizArenaFullView | QuizArenaEmptyView | null {
  if (next.kind !== 'delta') return next;
  if (previous?.kind !== 'full' || previous.epoch !== next.epoch) return null;
  if (next.seq <= previous.seq && !next.meta && !next.tiles.length)
    return { ...previous, canManage: next.canManage };
  return {
    ...previous,
    seq: next.seq,
    canManage: next.canManage,
    meta: next.meta ?? previous.meta,
    tiles: upsert(previous.tiles, next.tiles, ({ id }) => id).toSorted(
      (a, b) => a.categoryIndex - b.categoryIndex || a.tierIndex - b.tierIndex
    ),
    finalTile: next.finalTile ?? previous.finalTile,
    players: upsert(previous.players, next.players, ({ userId }) => userId),
    teams: upsert(previous.teams, next.teams, ({ id }) => id),
  };
}

export function rankQuizArenaPlayers(players: readonly ProjectedArenaPlayer[]) {
  return rankArenaEntries(players, (player) => ({
    score: player.score,
    name: player.displayName,
    id: player.userId,
  }));
}

export function rankQuizArenaTeams(teams: readonly ProjectedArenaTeam[]) {
  return rankArenaEntries(teams, (team) => ({
    score: team.score,
    name: team.name,
    id: team.id,
  }));
}
