import { canMeetRealtimeManageParticipants } from './permissions';
import type { MeetRealtimeTokenPayload } from './primitives';
import {
  exportQuizArenaCsv,
  exportQuizArenaJson,
} from './room-quiz-arena-export';
import {
  type ArenaTile,
  MAX_ARENA_BUZZ_QUEUE,
  MAX_QUIZ_ARENA_BYTES,
  type QuizArenaRoomCommand,
  type RoomQuizArenaState,
} from './room-quiz-arena-schema';
import {
  answerFits,
  applyPlayerDelta,
  applyTeamDelta,
  arenaAwardFor,
  arenaWagerKey,
  buildArenaState,
  ensurePlayer,
  gradeArenaAnswer,
  markParticipation,
  maxArenaWager,
  recomputeTeamAwards,
  setArenaAward,
  voidTileAwards,
} from './room-quiz-arena-scoring';
import { projectQuizArenaForUser } from './room-quiz-arena-view';
import type { RoomServiceState } from './room-service';

export * from './room-quiz-arena-export';
export * from './room-quiz-arena-schema';
export {
  arenaWagerKey,
  attendanceCredited,
  maxArenaWager,
  normalizeArenaAnswer,
  rankArenaEntries,
} from './room-quiz-arena-scoring';
export * from './room-quiz-arena-view';

/** Answers that arrive within this window after the timer still count. */
const ANSWER_GRACE_MS = 2000;
const PARTICIPANT_ACTIONS = new Set(['arena.state', 'buzz', 'answer', 'wager']);

type Result = {
  state: RoomServiceState;
  body: unknown;
  status?: number;
};

function bumpAllPlayers(state: RoomQuizArenaState) {
  for (const player of Object.values(state.players)) player.v = state.seq;
}

/** Grades pending answers, applies awards and closes the tile. */
function revealTile(state: RoomQuizArenaState, tile: ArenaTile) {
  for (const entry of tile.submissions) {
    if (entry.correct === null)
      entry.correct = gradeArenaAnswer(tile.question, entry.answer);
    if (entry.correct !== null && !(entry.userId in tile.awards))
      setArenaAward(
        state,
        tile,
        entry.userId,
        arenaAwardFor(
          state,
          tile,
          entry.userId,
          entry.correct,
          entry.submittedAt
        )
      );
  }
  recomputeTeamAwards(state, tile);
  tile.status = 'revealed';
  tile.v = state.seq;
  state.activeTileId = null;
  state.buzzersLocked = false;
  state.metaV = state.seq;
  bumpAllPlayers(state);
}

function endGame(state: RoomQuizArenaState) {
  const open = [
    ...state.tiles,
    ...(state.finalTile ? [state.finalTile] : []),
  ].filter(({ status }) => status === 'active');
  for (const tile of open) revealTile(state, tile);
  state.phase = 'ended';
  state.metaV = state.seq;
  for (const tile of state.tiles) tile.v = state.seq;
  if (state.finalTile) state.finalTile.v = state.seq;
  bumpAllPlayers(state);
}

function resetArena(state: RoomQuizArenaState) {
  state.epoch = crypto.randomUUID();
  state.baseSeq = state.seq;
  state.metaV = state.seq;
  state.phase = 'board';
  state.activeTileId = null;
  state.pickedBy = null;
  state.buzzersLocked = false;
  for (const tile of [
    ...state.tiles,
    ...(state.finalTile ? [state.finalTile] : []),
  ])
    Object.assign(tile, {
      status: 'available',
      openedAt: undefined,
      submissions: [],
      buzzQueue: [],
      wagers: {},
      wagerBy: [],
      awards: {},
      v: state.seq,
    });
  for (const player of Object.values(state.players))
    Object.assign(player, {
      score: 0,
      lastDelta: 0,
      participatedRounds: 0,
      v: state.seq,
    });
  for (const team of state.teams)
    Object.assign(team, { score: 0, lastDelta: 0, v: state.seq });
}

/** Moves the buzz turn to the next waiting player after a wrong answer. */
function advanceBuzzer(tile: ArenaTile) {
  if (
    tile.buzzQueue.some(
      ({ status }) => status === 'answering' || status === 'correct'
    )
  )
    return;
  const next = tile.buzzQueue.find(({ status }) => status === 'waiting');
  if (next) next.status = 'answering';
}

export function applyRoomQuizArena(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  command: QuizArenaRoomCommand
): Result {
  const accountId = token.accountId ?? token.userId;
  const canManage = canMeetRealtimeManageParticipants(token);
  const present = Object.values(snapshot.presence).some(
    (person) => (person.accountId ?? person.userId) === accountId
  );
  const fail = (error: string, status: number): Result => ({
    state: snapshot,
    body: { error },
    status,
  });
  if (
    !canManage &&
    ((!present && !snapshot.approved?.[accountId]) ||
      !PARTICIPANT_ACTIONS.has(command.action))
  )
    return fail('Forbidden', 403);

  const arena = snapshot.quizArena;
  if (command.action === 'arena.state')
    return {
      state: snapshot,
      body: projectQuizArenaForUser(
        arena,
        accountId,
        canManage,
        command.sinceSeq
      ),
    };
  if (command.action === 'arena.export') {
    if (!arena) return fail('Quiz Arena not found', 404);
    return {
      state: snapshot,
      body:
        command.format === 'csv'
          ? exportQuizArenaCsv(arena)
          : exportQuizArenaJson(arena),
    };
  }
  if (snapshot.ended) return fail('Meeting has ended', 409);
  if (command.action === 'arena.authorize')
    return { state: snapshot, body: { ok: true } };

  const save = (
    next: RoomQuizArenaState,
    body: unknown = { ok: true, seq: next.seq }
  ): Result => {
    if (
      new TextEncoder().encode(JSON.stringify(next)).byteLength >
      MAX_QUIZ_ARENA_BYTES
    )
      return fail('Quiz Arena storage is full', 409);
    return { state: { ...snapshot, quizArena: next }, body };
  };

  if (command.action === 'setup') {
    if (arena && arena.phase !== 'board' && arena.phase !== 'ended')
      return fail('End the current round before replacing the board', 409);
    const roster = Object.values(snapshot.presence)
      .filter(({ role }) => role !== 'host')
      .map((person) => ({
        userId: person.accountId ?? person.userId,
        displayName: person.displayName,
      }));
    const next = buildArenaState(
      command.board,
      command.config,
      (arena?.seq ?? 0) + 1,
      roster
    );
    return save(next, { ok: true, seq: next.seq, epoch: next.epoch });
  }
  if (!arena) return fail('Quiz Arena not found', 404);

  const state = structuredClone(arena);
  state.seq += 1;
  const now = Date.now();
  const findTile = (id: string) =>
    state.tiles.find((tile) => tile.id === id) ??
    (state.finalTile?.id === id ? state.finalTile : undefined);
  const player = () => ensurePlayer(state, accountId, token.displayName ?? '');

  switch (command.action) {
    case 'pickTile': {
      const tile = state.tiles.find(({ id }) => id === command.tileId);
      if (!tile) return fail('Tile not found', 404);
      if (state.phase !== 'board' || tile.status !== 'available')
        return fail('Tile is not available', 409);
      Object.assign(tile, { status: 'active', openedAt: now, v: state.seq });
      state.phase = 'question';
      state.activeTileId = tile.id;
      state.pickedBy = command.source;
      state.buzzersLocked = false;
      state.metaV = state.seq;
      return save(state);
    }
    case 'lockBuzzers':
      if (state.phase !== 'question') return fail('No active question', 409);
      state.buzzersLocked = command.locked;
      state.metaV = state.seq;
      return save(state);
    case 'buzz': {
      const tile = findTile(command.tileId);
      if (!tile || tile.isFinal || tile.id !== state.activeTileId)
        return fail('Tile is not active', 409);
      if (state.config.answerMode !== 'buzz_in')
        return fail('Buzzers are off for this game', 409);
      if (canManage) return fail('Hosts run the game', 409);
      if (state.buzzersLocked) return fail('Buzzers are locked', 409);
      if (tile.buzzQueue.some(({ userId }) => userId === accountId))
        return { state: snapshot, body: { ok: true, seq: arena.seq } };
      if (tile.buzzQueue.length >= MAX_ARENA_BUZZ_QUEUE)
        return fail('Buzz queue is full', 409);
      if (!player()) return fail('Player limit reached', 409);
      markParticipation(state, tile, accountId);
      const open = !tile.buzzQueue.some(
        ({ status }) => status === 'answering' || status === 'correct'
      );
      tile.buzzQueue.push({
        userId: accountId,
        buzzedAt: now,
        status: open ? 'answering' : 'waiting',
      });
      tile.v = state.seq;
      return save(state);
    }
    case 'wager': {
      const tile = findTile(command.tileId);
      const open = tile?.isFinal
        ? state.phase === 'final_wager'
        : tile?.isBonusWager && tile.id === state.activeTileId;
      if (!tile || !open) return fail('Wagers are closed', 409);
      if (canManage) return fail('Hosts run the game', 409);
      if (!player()) return fail('Player limit reached', 409);
      const key = arenaWagerKey(state, accountId);
      const answered = tile.submissions.some(
        ({ userId }) => arenaWagerKey(state, userId) === key
      );
      if (answered) return fail('Wagers lock after answering', 409);
      if (command.amount > maxArenaWager(state, tile, accountId))
        return fail('Wager is too high', 400);
      markParticipation(state, tile, accountId);
      tile.wagers[key] = command.amount;
      tile.wagerBy = [...new Set([...(tile.wagerBy ?? []), accountId])];
      tile.v = state.seq;
      return save(state);
    }
    case 'answer': {
      const tile = findTile(command.tileId);
      const open = tile?.isFinal
        ? state.phase === 'final_answer' && tile.status === 'active'
        : tile?.id === state.activeTileId && tile.status === 'active';
      if (!tile || !open) return fail('Tile is not active', 409);
      if (canManage) return fail('Hosts run the game', 409);
      if (!answerFits(tile.question, command.answer))
        return fail('Invalid answer', 400);
      const deadline =
        (tile.openedAt ?? now) + tile.question.quizMeta.timeLimitSec * 1000;
      if (now > deadline + ANSWER_GRACE_MS) return fail('Time is up', 409);
      if (!player()) return fail('Player limit reached', 409);
      const buzz = state.config.answerMode === 'buzz_in' && !tile.isFinal;
      if (buzz) {
        const turn = tile.buzzQueue.find(
          ({ userId, status }) => userId === accountId && status === 'answering'
        );
        if (!turn) return fail('Wait for your buzz turn', 409);
        if (tile.submissions.some(({ userId }) => userId === accountId))
          return fail('Answer already submitted', 409);
        const correct = gradeArenaAnswer(tile.question, command.answer);
        tile.submissions.push({
          userId: accountId,
          answer: command.answer,
          submittedAt: now,
          correct,
        });
        if (correct !== null) {
          turn.status = correct ? 'correct' : 'wrong';
          setArenaAward(
            state,
            tile,
            accountId,
            arenaAwardFor(state, tile, accountId, correct, now)
          );
          if (correct) state.buzzersLocked = true;
          else advanceBuzzer(tile);
          recomputeTeamAwards(state, tile);
          state.metaV = state.seq;
        }
        tile.v = state.seq;
        return save(state);
      }
      markParticipation(state, tile, accountId);
      tile.submissions = [
        ...tile.submissions.filter(({ userId }) => userId !== accountId),
        {
          userId: accountId,
          answer: command.answer,
          submittedAt: now,
          correct: null,
        },
      ];
      tile.v = state.seq;
      return save(state);
    }
    case 'judge': {
      const tile = findTile(command.tileId);
      if (!tile || (tile.status !== 'active' && tile.status !== 'revealed'))
        return fail('Tile is not open for judging', 409);
      const entry = tile.submissions.find(
        ({ userId }) => userId === command.userId
      );
      const turn = tile.buzzQueue.find(
        ({ userId }) => userId === command.userId
      );
      if (!entry && !turn) return fail('No answer to judge', 404);
      if (!state.players[command.userId]) return fail('Player not found', 404);
      if (entry) entry.correct = command.correct;
      if (turn) {
        turn.status = command.correct ? 'correct' : 'wrong';
        if (command.correct) state.buzzersLocked = true;
        else advanceBuzzer(tile);
        state.metaV = state.seq;
      }
      setArenaAward(
        state,
        tile,
        command.userId,
        arenaAwardFor(
          state,
          tile,
          command.userId,
          command.correct,
          entry?.submittedAt ?? turn?.buzzedAt
        )
      );
      recomputeTeamAwards(state, tile);
      tile.v = state.seq;
      return save(state);
    }
    case 'revealTile': {
      const tile = findTile(command.tileId);
      const open = tile?.isFinal
        ? state.phase === 'final_answer'
        : tile?.id === state.activeTileId;
      if (!tile || !open || tile.status !== 'active')
        return fail('Tile is not active', 409);
      revealTile(state, tile);
      if (tile.isFinal) endGame(state);
      else state.phase = 'board';
      return save(state);
    }
    case 'skipTile': {
      const tile = state.tiles.find(({ id }) => id === command.tileId);
      if (!tile || (tile.status !== 'available' && tile.status !== 'active'))
        return fail('Tile cannot be skipped', 409);
      voidTileAwards(state, tile);
      tile.status = 'skipped';
      tile.v = state.seq;
      if (state.activeTileId === tile.id) {
        state.activeTileId = null;
        state.phase = 'board';
        state.buzzersLocked = false;
        state.metaV = state.seq;
      }
      return save(state);
    }
    case 'adjustPoints': {
      const { target, mode, value } = command;
      if (target.type === 'player') {
        const entry = state.players[target.userId];
        if (!entry) return fail('Player not found', 404);
        applyPlayerDelta(
          state,
          entry,
          mode === 'set' ? value - entry.score : value
        );
      } else {
        const team = state.teams.find(({ id }) => id === target.teamId);
        if (!team) return fail('Team not found', 404);
        applyTeamDelta(
          state,
          team,
          mode === 'set' ? value - team.score : value
        );
      }
      return save(state);
    }
    case 'startFinalRound': {
      const tile = state.finalTile;
      if (!tile) return fail('This board has no final round', 404);
      if (command.stage === 'wager') {
        if (state.phase !== 'board' || tile.status !== 'available')
          return fail('Finish the current tile first', 409);
        state.phase = 'final_wager';
        tile.status = 'active';
        state.activeTileId = tile.id;
      } else {
        if (state.phase !== 'final_wager')
          return fail('Open the wager stage first', 409);
        state.phase = 'final_answer';
        tile.openedAt = now;
      }
      tile.v = state.seq;
      state.pickedBy = 'host';
      state.metaV = state.seq;
      return save(state);
    }
    case 'endGame':
      if (state.phase === 'ended')
        return { state: snapshot, body: { ok: true, seq: arena.seq } };
      endGame(state);
      return save(state);
    case 'reset':
      resetArena(state);
      return save(state, { ok: true, seq: state.seq, epoch: state.epoch });
  }
}
