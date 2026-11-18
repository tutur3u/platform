import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  arena,
  base,
  board,
  host,
  ok,
  player,
  room,
  run,
  setup,
  uuid,
  view,
} from './room-quiz-arena.fixtures';
import type { RoomServiceState } from './room-service';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('wager integrity and provenance', () => {
  const bonusOf = (state: RoomServiceState) =>
    arena(state).tiles.find((tile) => tile.isBonusWager)!;

  it('locks an individual wager and requires it before a bonus answer or buzz', () => {
    for (const answerMode of ['all_answer', 'buzz_in'] as const) {
      let state = setup({ answerMode, playMode: 'individual' });
      const bonus = bonusOf(state);
      state = ok(state, host, { action: 'arena.pickTile', tileId: bonus.id });
      const attempt =
        answerMode === 'buzz_in'
          ? { action: 'arena.buzz', tileId: bonus.id }
          : {
              action: 'arena.answer',
              tileId: bonus.id,
              answer: { text: 'RecursionError' },
            };
      expect(run(state, player(1), attempt).status).toBe(409);
      state = ok(state, player(1), {
        action: 'arena.wager',
        tileId: bonus.id,
        amount: 50,
      });
      expect(
        run(state, player(1), {
          action: 'arena.wager',
          tileId: bonus.id,
          amount: 200,
        }).status
      ).toBe(409);
      expect(
        arena(state).tiles.find((t) => t.id === bonus.id)?.wagers[uuid(1)]
      ).toBe(50);
      state = ok(state, player(1), attempt);
    }
  });

  it('locks a team wager for every teammate and lets them answer under it', () => {
    let state = setup(
      { answerMode: 'all_answer', playMode: 'teams', teams: ['A', 'B'] },
      4
    );
    const bonus = bonusOf(state);
    const teamOf = (n: number) => arena(state).players[uuid(n)]!.teamId;
    const mate = [2, 3, 4].find((n) => teamOf(n) === teamOf(1))!;
    const rival = [2, 3, 4].find((n) => teamOf(n) !== teamOf(1))!;
    state = ok(state, host, { action: 'arena.pickTile', tileId: bonus.id });
    state = ok(state, player(1), {
      action: 'arena.wager',
      tileId: bonus.id,
      amount: 100,
    });
    expect(
      run(state, player(mate), {
        action: 'arena.wager',
        tileId: bonus.id,
        amount: 0,
      }).status
    ).toBe(409);
    expect(
      view(state, mate).tiles.find((t) => t.id === bonus.id)?.question
    ).not.toBeNull();
    expect(
      view(state, rival).tiles.find((t) => t.id === bonus.id)?.question
    ).toBeNull();
    state = ok(state, player(mate), {
      action: 'arena.answer',
      tileId: bonus.id,
      answer: { text: 'RecursionError' },
    });
    expect(
      run(state, player(rival), {
        action: 'arena.answer',
        tileId: bonus.id,
        answer: { text: 'x' },
      }).status
    ).toBe(409);
  });

  it('accepts Mira and lesson provenance only from their verified server paths', () => {
    const state = setup({ answerMode: 'all_answer', playMode: 'individual' });
    const tileId = arena(state).tiles[0]!.id;
    const live = {
      ...host,
      scopes: [...host.scopes, 'meet:live-server'] as typeof base.scopes,
    };
    expect(
      run(state, host, { action: 'arena.pickTile', tileId, source: 'mira' })
        .status
    ).toBe(403);
    expect(
      arena(
        ok(state, live, { action: 'arena.pickTile', tileId, source: 'mira' })
      ).pickedBy
    ).toBe('mira');
    expect(
      arena(ok(state, host, { action: 'arena.pickTile', tileId })).pickedBy
    ).toBe('host');
    expect(
      run(room(1), live, {
        action: 'arena.setup',
        board: { ...board(), source: 'upskii' },
        config: { answerMode: 'all_answer', playMode: 'individual' },
      }).status
    ).toBe(403);
  });

  it('rejects approved Mira writes after the board changes', () => {
    const live = { ...host, scopes: [...host.scopes, 'meet:live-server'] };
    const replace = {
      action: 'arena.setup',
      board: board(),
      config: { answerMode: 'all_answer', playMode: 'individual' },
    };
    const first = ok(room(1), live, { ...replace, expectedEpoch: null });
    const expectedEpoch = arena(first).epoch;
    const current = ok(first, host, replace);
    const pick = {
      action: 'arena.pickTile',
      tileId: arena(current).tiles[0]!.id,
      source: 'mira',
    };
    for (const command of [
      { ...replace, expectedEpoch: null },
      { ...replace, expectedEpoch },
      { ...pick, expectedEpoch },
    ]) {
      const result = run(current, live, command);
      expect(result.status).toBe(409);
      expect(result.body).toEqual({ error: 'quiz_arena_board_changed' });
      expect(result.state).toBe(current);
    }
    expect(
      run(current, host, { ...replace, expectedEpoch: arena(current).epoch })
        .status
    ).toBe(403);
    expect(
      arena(ok(current, live, { ...pick, expectedEpoch: arena(current).epoch }))
        .pickedBy
    ).toBe('mira');
  });
});
