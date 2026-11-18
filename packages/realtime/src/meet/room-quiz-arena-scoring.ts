import type {
  ArenaAnswer,
  ArenaConfig,
  ArenaPlayer,
  ArenaQuestion,
  ArenaTeam,
  ArenaTile,
  RoomQuizArenaState,
} from './room-quiz-arena-schema';
import {
  type arenaBoardInputSchema,
  type arenaQuestionInputSchema,
  MAX_ARENA_PLAYERS,
} from './room-quiz-arena-schema';
import type { z } from 'zod';

type BoardOutput = z.output<typeof arenaBoardInputSchema>;
type QuestionOutput = z.output<typeof arenaQuestionInputSchema>;

export const normalizeArenaAnswer = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

function buildQuestion(
  input: QuestionOutput,
  points: number,
  timeLimitSec: number
): ArenaQuestion {
  const base = {
    kind: 'quiz' as const,
    question: input.question,
    quizMeta: {
      timeLimitSec,
      points,
      ...(input.explanation ? { explanation: input.explanation } : {}),
    },
  };
  if (input.type === 'open_text')
    return {
      ...base,
      type: 'open_text',
      quizMeta: { ...base.quizMeta, correctOptionIds: [] },
      acceptedAnswers: [
        ...new Set(input.acceptedAnswers.map(normalizeArenaAnswer)),
      ].filter(Boolean),
    };
  const options = input.options.map((label) => ({
    id: crypto.randomUUID(),
    label,
  }));
  const correct = options[input.correctIndex];
  return {
    ...base,
    type: 'single_choice',
    options,
    quizMeta: {
      ...base.quizMeta,
      correctOptionIds: correct ? [correct.id] : [],
    },
  };
}

function newTile(
  fields: Pick<
    ArenaTile,
    'categoryIndex' | 'tierIndex' | 'points' | 'isBonusWager' | 'isFinal'
  >,
  question: ArenaQuestion,
  seq: number
): ArenaTile {
  return {
    ...fields,
    id: crypto.randomUUID(),
    status: 'available',
    question,
    submissions: [],
    buzzQueue: [],
    wagers: {},
    awards: {},
    v: seq,
  };
}

export function buildArenaState(
  board: BoardOutput,
  config: ArenaConfig,
  seq: number,
  roster: Array<{ userId: string; displayName: string }>
): RoomQuizArenaState {
  const limit = config.defaultTimeLimitSec;
  const tiles = board.tiles
    .toSorted(
      (a, b) => a.categoryIndex - b.categoryIndex || a.tierIndex - b.tierIndex
    )
    .map((tile) => {
      const points = board.tierPoints[tile.tierIndex] ?? 0;
      return newTile(
        {
          categoryIndex: tile.categoryIndex,
          tierIndex: tile.tierIndex,
          points,
          isBonusWager: tile.isBonusWager,
          isFinal: false,
        },
        buildQuestion(tile.question, points, tile.timeLimitSec ?? limit),
        seq
      );
    });
  const finalPoints = board.tierPoints.at(-1) ?? 0;
  const finalTile = board.finalRound
    ? newTile(
        {
          categoryIndex: -1,
          tierIndex: -1,
          points: finalPoints,
          isBonusWager: true,
          isFinal: true,
        },
        buildQuestion(
          board.finalRound.question,
          finalPoints,
          board.finalRound.timeLimitSec ?? Math.max(limit, 60)
        ),
        seq
      )
    : undefined;
  const teams =
    config.playMode === 'teams'
      ? (config.teams ?? ['Team 1', 'Team 2']).map((name) => ({
          id: crypto.randomUUID(),
          name,
          score: 0,
          lastDelta: 0,
          v: seq,
        }))
      : [];
  const state: RoomQuizArenaState = {
    epoch: crypto.randomUUID(),
    seq,
    baseSeq: seq,
    metaV: seq,
    title: board.title,
    categories: board.categories,
    finalCategory: board.finalRound?.category,
    tierPoints: board.tierPoints,
    config,
    source: board.source,
    phase: 'board',
    activeTileId: null,
    pickedBy: null,
    buzzersLocked: false,
    tiles,
    finalTile,
    players: {},
    teams,
  };
  // Everyone present at setup is listed, so attendance covers silent players.
  if (config.playMode === 'individual' || config.autoAssignTeams)
    for (const person of roster)
      ensurePlayer(state, person.userId, person.displayName);
  return state;
}

/** Registers a player, assigning teams round-robin by current team size. */
export function ensurePlayer(
  state: RoomQuizArenaState,
  userId: string,
  displayName: string
): ArenaPlayer | null {
  const existing = state.players[userId];
  if (existing) return existing;
  if (Object.keys(state.players).length >= MAX_ARENA_PLAYERS) return null;
  let teamId: string | undefined;
  if (state.config.playMode === 'teams' && state.teams.length) {
    const sizes = new Map(state.teams.map(({ id }) => [id, 0]));
    for (const player of Object.values(state.players))
      if (player.teamId)
        sizes.set(player.teamId, (sizes.get(player.teamId) ?? 0) + 1);
    const team = state.teams.toSorted(
      (a, b) => (sizes.get(a.id) ?? 0) - (sizes.get(b.id) ?? 0)
    )[0];
    if (team) {
      teamId = team.id;
      team.v = state.seq;
    }
  }
  const player: ArenaPlayer = {
    userId,
    displayName: displayName.slice(0, 120),
    ...(teamId ? { teamId } : {}),
    score: 0,
    lastDelta: 0,
    participatedRounds: 0,
    v: state.seq,
  };
  state.players[userId] = player;
  return player;
}

export function gradeArenaAnswer(
  question: ArenaQuestion,
  answer: ArenaAnswer
): boolean | null {
  if ('optionId' in answer)
    return question.type === 'single_choice'
      ? (question.quizMeta.correctOptionIds ?? []).includes(answer.optionId)
      : null;
  if (question.type !== 'open_text' || !question.acceptedAnswers?.length)
    return null;
  return question.acceptedAnswers.includes(normalizeArenaAnswer(answer.text));
}

export function answerFits(question: ArenaQuestion, answer: ArenaAnswer) {
  return 'optionId' in answer
    ? question.type === 'single_choice' &&
        !!question.options?.some(({ id }) => id === answer.optionId)
    : question.type === 'open_text';
}

const teamOf = (state: RoomQuizArenaState, userId: string) => {
  const teamId = state.players[userId]?.teamId;
  return teamId ? state.teams.find(({ id }) => id === teamId) : undefined;
};

/**
 * Wagers belong to the team in team play and to the player otherwise. The
 * key is stored as `team:<id>` or the player's account ID.
 */
export function arenaWagerKey(state: RoomQuizArenaState, userId: string) {
  const team =
    state.config.playMode === 'teams' ? teamOf(state, userId) : undefined;
  return team ? `team:${team.id}` : userId;
}

/** Maximum wager: the larger of the current (team) score and the tile's value. */
export function maxArenaWager(
  state: RoomQuizArenaState,
  tile: ArenaTile,
  userId: string
) {
  const team =
    state.config.playMode === 'teams' ? teamOf(state, userId) : undefined;
  const score = team ? team.score : (state.players[userId]?.score ?? 0);
  return Math.max(score, tile.points);
}

function penaltyFor(state: RoomQuizArenaState, tile: ArenaTile) {
  const penalty = state.config.wrongAnswerPenalty;
  return penalty === 'full'
    ? -tile.points
    : penalty === 'half'
      ? -Math.round(tile.points / 2)
      : 0;
}

/** Points a graded submission earns before any previous award is reversed. */
export function arenaAwardFor(
  state: RoomQuizArenaState,
  tile: ArenaTile,
  userId: string,
  correct: boolean,
  submittedAt?: number
) {
  if (tile.isBonusWager) {
    const wager = tile.wagers[arenaWagerKey(state, userId)] ?? 0;
    return correct ? wager : -wager;
  }
  if (!correct) return penaltyFor(state, tile);
  if (
    !state.config.speedBonus ||
    state.config.answerMode !== 'all_answer' ||
    submittedAt === undefined ||
    tile.openedAt === undefined
  )
    return tile.points;
  const window = tile.question.quizMeta.timeLimitSec * 1000;
  const remaining = Math.max(0, 1 - (submittedAt - tile.openedAt) / window);
  return tile.points + Math.round(tile.points * 0.2 * remaining);
}

/** Applies `amount` as the player's total award on the tile, reversing any earlier one. */
export function setArenaAward(
  state: RoomQuizArenaState,
  tile: ArenaTile,
  userId: string,
  amount: number
) {
  const player = state.players[userId];
  if (!player) return;
  const delta = amount - (tile.awards[userId] ?? 0);
  if (delta === 0 && userId in tile.awards) return;
  tile.awards[userId] = amount;
  player.score += delta;
  player.lastDelta = delta;
  player.v = state.seq;
}

function setTeamAward(
  state: RoomQuizArenaState,
  tile: ArenaTile,
  team: ArenaTeam,
  amount: number
) {
  const key = `team:${team.id}`;
  const delta = amount - (tile.awards[key] ?? 0);
  if (delta === 0 && key in tile.awards) return;
  tile.awards[key] = amount;
  team.score += delta;
  team.lastDelta = delta;
  team.v = state.seq;
}

/**
 * Team play scores teams as units. In buzz-in rounds the team takes its
 * buzzers' awards; when everyone answers, the team is right when a strict
 * majority of its graded answers is right.
 */
export function recomputeTeamAwards(
  state: RoomQuizArenaState,
  tile: ArenaTile
) {
  if (state.config.playMode !== 'teams') return;
  const buzz = state.config.answerMode === 'buzz_in' && !tile.isFinal;
  for (const team of state.teams) {
    const members = tile.submissions.filter(
      ({ userId }) => state.players[userId]?.teamId === team.id
    );
    if (buzz) {
      const total = Object.entries(tile.awards)
        .filter(([id]) => state.players[id]?.teamId === team.id)
        .reduce((sum, [, amount]) => sum + amount, 0);
      if (total !== 0 || `team:${team.id}` in tile.awards)
        setTeamAward(state, tile, team, total);
      continue;
    }
    const graded = members.filter(({ correct }) => correct !== null);
    if (!graded.length) continue;
    const right =
      graded.filter(({ correct }) => correct).length * 2 > graded.length;
    const wager = tile.wagers[`team:${team.id}`] ?? 0;
    setTeamAward(
      state,
      tile,
      team,
      tile.isBonusWager
        ? right
          ? wager
          : -wager
        : right
          ? tile.points
          : penaltyFor(state, tile)
    );
  }
}

/** Host corrections move a player's or team's total without a tile. */
export function applyPlayerDelta(
  state: RoomQuizArenaState,
  player: ArenaPlayer,
  delta: number
) {
  player.score += delta;
  player.lastDelta = delta;
  player.v = state.seq;
}

export function applyTeamDelta(
  state: RoomQuizArenaState,
  team: ArenaTeam,
  delta: number
) {
  team.score += delta;
  team.lastDelta = delta;
  team.v = state.seq;
}

/** Counts a player's participation once per tile. */
export function markParticipation(
  state: RoomQuizArenaState,
  tile: ArenaTile,
  userId: string
) {
  const player = state.players[userId];
  if (!player) return;
  const already =
    tile.submissions.some((entry) => entry.userId === userId) ||
    tile.buzzQueue.some((entry) => entry.userId === userId) ||
    tile.wagerBy?.includes(userId);
  if (already) return;
  // Row versions move on reveal, so 50 answers do not resend 50 rows.
  player.participatedRounds += 1;
}

export function playedArenaRounds(state: RoomQuizArenaState) {
  return (
    state.tiles.filter(({ status }) => status === 'revealed').length +
    (state.finalTile?.status === 'revealed' ? 1 : 0)
  );
}

export function attendanceCredited(
  state: RoomQuizArenaState,
  player: Pick<ArenaPlayer, 'participatedRounds'>
) {
  const played = playedArenaRounds(state);
  if (played === 0) return player.participatedRounds > 0;
  return (
    player.participatedRounds >=
    Math.max(1, Math.ceil(played * state.config.attendanceThreshold))
  );
}

type Rankable = { score: number; name: string; id: string };
/** Standard competition ranking (1, 2, 2, 4) with a stable name order. */
export function rankArenaEntries<T>(
  entries: readonly T[],
  key: (entry: T) => Rankable
): Array<T & { rank: number }> {
  const sorted = entries.toSorted((a, b) => {
    const left = key(a);
    const right = key(b);
    return (
      right.score - left.score ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id)
    );
  });
  let rank = 0;
  let previous: number | undefined;
  return sorted.map((entry, index) => {
    const { score } = key(entry);
    if (score !== previous) rank = index + 1;
    previous = score;
    return { ...entry, rank };
  });
}

/** Reverses every award on a skipped tile. */
export function voidTileAwards(state: RoomQuizArenaState, tile: ArenaTile) {
  for (const [key, amount] of Object.entries(tile.awards)) {
    if (key.startsWith('team:')) {
      const team = state.teams.find(({ id }) => `team:${id}` === key);
      if (team && amount) applyTeamDelta(state, team, -amount);
    } else setArenaAward(state, tile, key, 0);
  }
  tile.awards = {};
}
