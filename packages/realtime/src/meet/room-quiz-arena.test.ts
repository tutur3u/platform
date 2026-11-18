import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeQuizArenaDelta,
  exportQuizArenaCsv,
  exportQuizArenaJson,
  type QuizArenaFullView,
  type QuizArenaView,
  mergeQuizArenaView,
  projectQuizArenaForUser,
  quizArenaRoomCommandSchema,
  rankQuizArenaPlayers,
} from './room-quiz-arena';
import {
  arena,
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
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('quiz arena commands', () => {
  it('parses prefixed mutations through the same browser schema', () => {
    expect(
      quizArenaRoomCommandSchema.safeParse({
        action: 'arena.pickTile',
        tileId: uuid(5),
      }).data
    ).toEqual({ action: 'pickTile', tileId: uuid(5), source: 'host' });
    expect(
      quizArenaRoomCommandSchema.safeParse({
        action: 'arena.pickTile',
        tileId: 'x',
      }).success
    ).toBe(false);
    expect(
      quizArenaRoomCommandSchema.safeParse({ action: 'arena.unknown' }).success
    ).toBe(false);
  });

  it('rejects boards with duplicate cells, missing categories or duplicate options', () => {
    const tile = board().tiles[0]!;
    for (const input of [
      board({ tiles: [tile, tile] }),
      board({ tiles: [{ ...tile, categoryIndex: 4 }] }),
      board({
        tiles: [
          {
            ...tile,
            question: {
              type: 'single_choice',
              question: 'Q',
              options: ['A', 'a'],
              correctIndex: 0,
            },
          },
        ],
      }),
    ])
      expect(
        run(room(1), host, {
          action: 'arena.setup',
          board: input,
          config: { answerMode: 'all_answer', playMode: 'individual' },
        }).status
      ).toBe(400);
  });

  it('keeps every management action host-only', () => {
    const state = setup({ answerMode: 'all_answer', playMode: 'individual' });
    const tileId = arena(state).tiles[0]!.id;
    for (const command of [
      {
        action: 'arena.setup',
        board: board(),
        config: { answerMode: 'all_answer', playMode: 'individual' },
      },
      { action: 'arena.pickTile', tileId },
      { action: 'arena.lockBuzzers', locked: true },
      { action: 'arena.revealTile', tileId },
      { action: 'arena.skipTile', tileId },
      { action: 'arena.judge', tileId, userId: uuid(1), correct: true },
      {
        action: 'arena.adjustPoints',
        target: { type: 'player', userId: uuid(1) },
        mode: 'delta',
        value: 100,
      },
      { action: 'arena.startFinalRound' },
      { action: 'arena.endGame' },
      { action: 'arena.reset' },
      { action: 'arena.export', format: 'csv' },
      { action: 'arena.authorize' },
    ])
      expect(run(state, player(1), command).status).toBe(403);
    expect(run(state, player(77), { action: 'arena.state' }).status).toBe(403);
    expect(
      run(state, { ...host, scopes: [] }, { action: 'arena.state' }).status
    ).toBe(403);
  });
});

describe('answer-key secrecy', () => {
  it('hides questions until picked and answer keys until reveal', () => {
    let state = setup({ answerMode: 'all_answer', playMode: 'individual' });
    const [first] = arena(state).tiles;
    const hidden = JSON.stringify(view(state, 1));
    expect(hidden).not.toContain('Base case of factorial');
    expect(hidden).not.toContain('Stops the recursion');
    expect(hidden).not.toContain('recursionerror');
    expect(
      view(state, 0, true).tiles[0]?.reveal?.correctOptionIds
    ).toHaveLength(1);

    state = ok(state, host, { action: 'arena.pickTile', tileId: first!.id });
    const active = view(state, 1).tiles[0]!;
    expect(active.question?.question).toBe('Base case of factorial?');
    expect(active.reveal).toBeNull();
    expect(JSON.stringify(view(state, 1))).not.toContain('Stops the recursion');

    state = ok(state, host, { action: 'arena.revealTile', tileId: first!.id });
    expect(view(state, 1).tiles[0]?.reveal?.explanation).toBe(
      'Stops the recursion.'
    );
  });

  it('shows a bonus question only after the player or team wagers', () => {
    let state = setup({ answerMode: 'all_answer', playMode: 'individual' });
    const bonus = arena(state).tiles.find((tile) => tile.isBonusWager)!;
    state = ok(state, host, { action: 'arena.pickTile', tileId: bonus.id });
    expect(
      view(state, 1).tiles.find(({ id }) => id === bonus.id)?.question
    ).toBeNull();
    expect(
      run(state, player(1), {
        action: 'arena.wager',
        tileId: bonus.id,
        amount: 201,
      }).status
    ).toBe(400);
    state = ok(state, player(1), {
      action: 'arena.wager',
      tileId: bonus.id,
      amount: 200,
    });
    expect(
      view(state, 1).tiles.find(({ id }) => id === bonus.id)?.question?.question
    ).toContain('overflow');
    expect(
      view(state, 2).tiles.find(({ id }) => id === bonus.id)?.question
    ).toBeNull();
  });
});

describe('all-answer mode', () => {
  it('grades choices on reveal with speed bonus and wrong-answer penalty', () => {
    let state = setup({
      answerMode: 'all_answer',
      playMode: 'individual',
      speedBonus: true,
      wrongAnswerPenalty: 'half',
    });
    const tile = arena(state).tiles[0]!;
    const [right, wrong] = tile.question.options!;
    state = ok(state, host, { action: 'arena.pickTile', tileId: tile.id });
    state = ok(state, player(1), {
      action: 'arena.answer',
      tileId: tile.id,
      answer: { optionId: right!.id },
    });
    vi.advanceTimersByTime(15_000);
    state = ok(state, player(2), {
      action: 'arena.answer',
      tileId: tile.id,
      answer: { optionId: right!.id },
    });
    state = ok(state, player(3), {
      action: 'arena.answer',
      tileId: tile.id,
      answer: { optionId: wrong!.id },
    });
    expect(view(state, 1).tiles[0]?.myResult).toBeNull();
    state = ok(state, host, { action: 'arena.revealTile', tileId: tile.id });
    const scores = Object.fromEntries(
      view(state, 0, true).players.map((p) => [p.userId, p.score])
    );
    expect(scores[uuid(1)]).toBe(120);
    expect(scores[uuid(2)]).toBe(110);
    expect(scores[uuid(3)]).toBe(-50);
    expect(view(state, 3).tiles[0]?.myResult).toEqual({
      correct: false,
      delta: -50,
    });
    expect(view(state, 1).tiles[0]?.results?.correctCount).toBe(2);
  });

  it('rejects answers after the timer and short answers are host-judged', () => {
    let state = setup({ answerMode: 'all_answer', playMode: 'individual' });
    const open = arena(state).tiles[2]!;
    state = ok(state, host, { action: 'arena.pickTile', tileId: open.id });
    state = ok(state, player(1), {
      action: 'arena.answer',
      tileId: open.id,
      answer: { text: 'Split then merge' },
    });
    vi.advanceTimersByTime(33_000);
    expect(
      run(state, player(2), {
        action: 'arena.answer',
        tileId: open.id,
        answer: { text: 'late' },
      }).status
    ).toBe(409);
    state = ok(state, host, { action: 'arena.revealTile', tileId: open.id });
    expect(view(state, 1).players[0]?.score).toBe(0);
    state = ok(state, host, {
      action: 'arena.judge',
      tileId: open.id,
      userId: uuid(1),
      correct: true,
    });
    state = ok(state, host, {
      action: 'arena.judge',
      tileId: open.id,
      userId: uuid(1),
      correct: true,
    });
    expect(
      view(state, 1).players.find((p) => p.userId === uuid(1))?.score
    ).toBe(100);
  });
});

describe('buzz-in mode', () => {
  it('orders buzzes, grades the active buzzer and passes the turn on a miss', () => {
    let state = setup({
      answerMode: 'buzz_in',
      playMode: 'individual',
      wrongAnswerPenalty: 'full',
    });
    const tile = arena(state).tiles[0]!;
    const [right, wrong] = tile.question.options!;
    expect(
      run(state, player(1), { action: 'arena.buzz', tileId: tile.id }).status
    ).toBe(409);
    state = ok(state, host, { action: 'arena.pickTile', tileId: tile.id });
    state = ok(state, player(2), { action: 'arena.buzz', tileId: tile.id });
    vi.advanceTimersByTime(120);
    state = ok(state, player(1), { action: 'arena.buzz', tileId: tile.id });
    expect(
      view(state, 1).tiles[0]?.buzzQueue.map((b) => [b.userId, b.status])
    ).toEqual([
      [uuid(2), 'answering'],
      [uuid(1), 'waiting'],
    ]);
    expect(
      run(state, player(1), {
        action: 'arena.answer',
        tileId: tile.id,
        answer: { optionId: right!.id },
      }).status
    ).toBe(409);
    state = ok(state, player(2), {
      action: 'arena.answer',
      tileId: tile.id,
      answer: { optionId: wrong!.id },
    });
    state = ok(state, player(1), {
      action: 'arena.answer',
      tileId: tile.id,
      answer: { optionId: right!.id },
    });
    expect(arena(state).buzzersLocked).toBe(true);
    expect(
      run(state, player(3), { action: 'arena.buzz', tileId: tile.id }).status
    ).toBe(409);
    state = ok(state, host, { action: 'arena.revealTile', tileId: tile.id });
    const scores = Object.fromEntries(
      view(state, 0, true).players.map((p) => [p.userId, p.score])
    );
    expect(scores).toMatchObject({ [uuid(1)]: 100, [uuid(2)]: -100 });
  });

  it('lets the host lock buzzers and judge a spoken answer', () => {
    let state = setup({ answerMode: 'buzz_in', playMode: 'individual' });
    const tile = arena(state).tiles[2]!;
    state = ok(state, host, { action: 'arena.pickTile', tileId: tile.id });
    state = ok(state, host, { action: 'arena.lockBuzzers', locked: true });
    expect(
      run(state, player(1), { action: 'arena.buzz', tileId: tile.id }).status
    ).toBe(409);
    state = ok(state, host, { action: 'arena.lockBuzzers', locked: false });
    state = ok(state, player(1), { action: 'arena.buzz', tileId: tile.id });
    state = ok(state, host, {
      action: 'arena.judge',
      tileId: tile.id,
      userId: uuid(1),
      correct: true,
    });
    expect(
      view(state, 1).players.find((p) => p.userId === uuid(1))?.score
    ).toBe(100);
  });
});

describe('teams, wagers and the final round', () => {
  it('balances teams, scores them by majority and caps team wagers by team score', () => {
    let state = setup(
      { answerMode: 'all_answer', playMode: 'teams', teams: ['Teal', 'Blue'] },
      4
    );
    const teams = arena(state).teams;
    const members = (id: string) =>
      Object.values(arena(state).players).filter((p) => p.teamId === id).length;
    expect(teams.map(({ id }) => members(id))).toEqual([2, 2]);
    const tile = arena(state).tiles[0]!;
    const [right, wrong] = tile.question.options!;
    state = ok(state, host, { action: 'arena.pickTile', tileId: tile.id });
    for (let n = 1; n <= 4; n++) {
      const team = arena(state).players[uuid(n)]!.teamId;
      const correct = team === teams[0]!.id || n === 4;
      state = ok(state, player(n), {
        action: 'arena.answer',
        tileId: tile.id,
        answer: { optionId: (correct ? right : wrong)!.id },
      });
    }
    state = ok(state, host, { action: 'arena.revealTile', tileId: tile.id });
    const scored = Object.fromEntries(
      view(state, 0, true).teams.map((t) => [t.name, t.score])
    );
    expect(scored.Teal).toBe(100);
    expect(scored.Blue).toBe(0);

    state = ok(state, host, { action: 'arena.startFinalRound' });
    const finalId = arena(state).finalTile!.id;
    const teal = Object.values(arena(state).players).find(
      (p) => p.teamId === teams[0]!.id
    )!;
    const tealToken = player(Number(teal.userId.slice(-4)));
    expect(
      run(state, tealToken, {
        action: 'arena.wager',
        tileId: finalId,
        amount: 201,
      }).status
    ).toBe(400);
    state = ok(state, tealToken, {
      action: 'arena.wager',
      tileId: finalId,
      amount: 200,
    });
    expect(view(state, 1).finalTile?.question).toBeNull();
    state = ok(state, host, {
      action: 'arena.startFinalRound',
      stage: 'answer',
    });
    const stack = arena(state).finalTile!.question.options![0]!;
    state = ok(state, tealToken, {
      action: 'arena.answer',
      tileId: finalId,
      answer: { optionId: stack.id },
    });
    state = ok(state, host, { action: 'arena.revealTile', tileId: finalId });
    expect(arena(state).phase).toBe('ended');
    expect(
      view(state, 0, true).teams.find((t) => t.name === 'Teal')?.score
    ).toBe(300);
  });

  it('adjusts points by delta or absolute value and resets to a new epoch', () => {
    let state = setup(
      { answerMode: 'all_answer', playMode: 'teams', teams: ['A', 'B'] },
      2
    );
    const teamId = arena(state).teams[0]!.id;
    state = ok(state, host, {
      action: 'arena.adjustPoints',
      target: { type: 'team', teamId },
      mode: 'delta',
      value: 100,
    });
    state = ok(state, host, {
      action: 'arena.adjustPoints',
      target: { type: 'player', userId: uuid(1) },
      mode: 'set',
      value: 450,
    });
    expect(arena(state).teams[0]?.score).toBe(100);
    expect(arena(state).players[uuid(1)]?.score).toBe(450);
    const epoch = arena(state).epoch;
    const seq = arena(state).seq;
    state = ok(state, host, { action: 'arena.reset' });
    expect(arena(state).epoch).not.toBe(epoch);
    expect(arena(state).players[uuid(1)]?.score).toBe(0);
    expect(
      projectQuizArenaForUser(arena(state), uuid(1), false, seq).kind
    ).toBe('full');
  });
});

describe('exports', () => {
  it('writes formula-safe CSV with scores and attendance credit', () => {
    let state = setup({ answerMode: 'all_answer', playMode: 'individual' }, 2);
    const tile = arena(state).tiles[0]!;
    state = ok(state, host, { action: 'arena.pickTile', tileId: tile.id });
    state = ok(state, player(1), {
      action: 'arena.answer',
      tileId: tile.id,
      answer: { optionId: tile.question.options![0]!.id },
    });
    state = ok(state, host, { action: 'arena.revealTile', tileId: tile.id });
    const csv = run(state, host, { action: 'arena.export', format: 'csv' })
      .body as string;
    expect(csv).toContain('"attendance_credited"');
    expect(csv).toContain(`"1","${uuid(1)}","Player 1","","100","1","true"`);
    expect(csv).toContain(`"${uuid(2)}","Player 2","","0","0","false"`);
    const hostile = exportQuizArenaCsv({
      ...arena(state),
      players: {
        x: {
          userId: 'x',
          displayName: '=cmd()',
          score: 0,
          lastDelta: 0,
          participatedRounds: 0,
          v: 0,
        },
      },
    });
    expect(hostile).toContain(`"'=cmd()"`);
    const json = exportQuizArenaJson(arena(state));
    expect(json.individualScores[0]).toMatchObject({
      rank: 1,
      attendanceCredited: true,
    });
  });
});

describe('deltas and scale', () => {
  it('serves compact deltas that merge into the full view', () => {
    let state = setup({ answerMode: 'all_answer', playMode: 'individual' });
    const full = view(state, 1);
    const tile = arena(state).tiles[0]!;
    state = ok(state, host, { action: 'arena.pickTile', tileId: tile.id });
    const delta = projectQuizArenaForUser(
      arena(state),
      uuid(1),
      false,
      full.seq
    );
    expect(delta.kind).toBe('delta');
    if (delta.kind !== 'delta') return;
    expect(delta.tiles.map(({ id }) => id)).toEqual([tile.id]);
    const merged = mergeQuizArenaView(full, delta) as QuizArenaFullView;
    expect(merged.meta.activeTileId).toBe(tile.id);
    expect(merged.tiles).toHaveLength(full.tiles.length);
    expect(mergeQuizArenaView({ ...full, epoch: 'old' }, delta)).toBeNull();
    expect(computeQuizArenaDelta(arena(state), arena(state).seq).tiles).toEqual(
      []
    );
  });

  it('handles 50 players answering and buzzing within the byte budget', () => {
    const count = 50;
    let state = setup(
      {
        answerMode: 'all_answer',
        playMode: 'teams',
        teams: ['A', 'B', 'C', 'D', 'E'],
        speedBonus: true,
      },
      count
    );
    const tile = arena(state).tiles[0]!;
    const options = tile.question.options!;
    state = ok(state, host, { action: 'arena.pickTile', tileId: tile.id });
    let before = arena(state).seq;
    for (let n = 1; n <= count; n++) {
      vi.advanceTimersByTime(100);
      state = ok(state, player(n), {
        action: 'arena.answer',
        tileId: tile.id,
        answer: { optionId: options[n % 3 === 0 ? 1 : 0]!.id },
      });
    }
    const delta = projectQuizArenaForUser(
      arena(state),
      uuid(7),
      false,
      before
    ) as QuizArenaView;
    const deltaBytes = new TextEncoder().encode(
      JSON.stringify(delta)
    ).byteLength;
    expect(deltaBytes).toBeLessThan(4 * 1024);
    expect(delta.kind === 'delta' && delta.tiles[0]?.reveal).toBeNull();
    expect(delta.kind === 'delta' && delta.players).toEqual([]);
    state = ok(state, host, { action: 'arena.revealTile', tileId: tile.id });
    const ranked = rankQuizArenaPlayers(view(state, 0, true).players);
    expect(ranked).toHaveLength(count);
    expect(ranked[0]?.userId).toBe(uuid(1));
    expect(ranked.at(-1)?.score).toBe(0);
    const fullBytes = new TextEncoder().encode(
      JSON.stringify(view(state, 7))
    ).byteLength;
    expect(fullBytes).toBeLessThan(32 * 1024);

    const second = arena(state).tiles[1]!;
    state = ok(state, host, { action: 'arena.pickTile', tileId: second.id });
    before = arena(state).seq;
    let rejected = 0;
    for (let n = 1; n <= count; n++) {
      const result = run(state, player(n), {
        action: 'arena.wager',
        tileId: second.id,
        amount: 0,
      });
      if (result.status) rejected++;
      else state = result.state;
    }
    // One locked wager per team; later teammates cannot re-stake.
    expect(rejected).toBe(45);
    expect(Object.keys(arena(state).tiles[1]!.wagers)).toHaveLength(5);
    expect(
      new TextEncoder().encode(JSON.stringify(arena(state))).byteLength
    ).toBeLessThan(512 * 1024);
  });

  it('caps the buzz queue for 50 simultaneous buzzes', () => {
    let state = setup({ answerMode: 'buzz_in', playMode: 'individual' }, 50);
    const tile = arena(state).tiles[0]!;
    state = ok(state, host, { action: 'arena.pickTile', tileId: tile.id });
    const statuses: number[] = [];
    for (let n = 1; n <= 50; n++) {
      const result = run(state, player(n), {
        action: 'arena.buzz',
        tileId: tile.id,
      });
      statuses.push(result.status ?? 200);
      state = result.state;
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(30);
    expect(statuses.filter((s) => s === 409)).toHaveLength(20);
    expect(arena(state).tiles[0]!.buzzQueue[0]?.status).toBe('answering');
  });
});
