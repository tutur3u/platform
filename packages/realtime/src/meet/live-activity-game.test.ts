import { describe, expect, it } from 'vitest';
import {
  action,
  cohost,
  error,
  guest,
  host,
  other,
  read,
  room,
  time,
} from './live-activities.fixtures';

describe('game', () => {
  it('accepts the first answer before the deadline and scores once at reveal', () => {
    const rounds = [
      { prompt: 'Pick', options: ['A', 'B'], answer: 1, seconds: 5 },
    ];
    expect(
      action(room(), guest, { kind: 'game.set', rounds }).reply
    ).toMatchObject(error('permission_denied'));
    const ready = action(room(), host, { kind: 'game.set', rounds }).state;
    expect(action(ready, guest, { kind: 'game.start' }).reply).toMatchObject(
      error('permission_denied')
    );
    const started = action(ready, host, { kind: 'game.start' });
    const roundId = started.state.liveActivities?.game.rounds[0]?.id;
    expect(started.broadcast).toMatchObject([
      { snapshot: { game: { round: { endsAt: time + 5000 }, scores: [] } } },
    ]);
    expect(JSON.stringify(started.broadcast)).not.toContain('correct');
    const answered = action(
      started.state,
      guest,
      { kind: 'game.answer', roundId, choice: 1 },
      4999
    );
    expect(answered.broadcast).toMatchObject([
      { snapshot: { game: { answered: 1, scores: [] } } },
    ]);
    expect(read(answered.state, other).reply).toMatchObject([
      {},
      { mine: { game: {} } },
    ]);
    expect(
      action(
        answered.state,
        guest,
        { kind: 'game.answer', roundId, choice: 0 },
        4999
      ).state
    ).toBe(answered.state);
    expect(
      action(
        answered.state,
        other,
        { kind: 'game.answer', roundId, choice: 1 },
        5000
      ).reply
    ).toMatchObject(error('activity_game_closed'));
    const reset = action(answered.state, cohost, { kind: 'game.reset' }).state;
    const restarted = action(reset, host, { kind: 'game.start' }).state;
    expect(restarted.liveActivities?.game.rounds[0]?.id).not.toBe(roundId);
    expect(
      action(restarted, guest, { kind: 'game.answer', roundId, choice: 1 })
        .reply
    ).toMatchObject(error('activity_invalid_choice'));
    const revealed = action(
      answered.state,
      cohost,
      { kind: 'game.reveal' },
      5000
    );
    expect(revealed.broadcast).toMatchObject([
      {
        snapshot: {
          game: {
            phase: 'reveal',
            round: { correct: 1 },
            scores: [{ participantId: guest.userId, score: 100 }],
          },
        },
      },
    ]);
    expect(
      action(revealed.state, host, { kind: 'game.reveal' }, 5001).state
    ).toBe(revealed.state);
    expect(
      action(revealed.state, host, { kind: 'game.next' }, 5001).broadcast
    ).toMatchObject([
      { snapshot: { game: { phase: 'done', round: { correct: 1 } } } },
    ]);
  });

  it('refuses new rounds while a game is running, so a late save cannot wipe it', () => {
    const round = {
      prompt: 'Pick',
      options: ['A', 'B'],
      answer: 1,
      seconds: 5,
    };
    const late = { kind: 'game.set', rounds: [{ ...round, prompt: 'New' }] };
    const ready = action(room(), host, {
      kind: 'game.set',
      rounds: [round],
    }).state;
    // Still idle: the rounds can be replaced.
    expect(
      action(ready, cohost, late).state.liveActivities?.game.rounds[0]?.prompt
    ).toBe('New');
    const started = action(ready, host, { kind: 'game.start' }).state;
    const roundId = started.liveActivities?.game.rounds[0]?.id;
    const answered = action(started, guest, {
      kind: 'game.answer',
      roundId,
      choice: 1,
    }).state;
    const revealed = action(answered, host, { kind: 'game.reveal' }).state;
    const done = action(revealed, host, { kind: 'game.next' }).state;
    for (const running of [answered, revealed, done]) {
      const refused = action(running, cohost, late);
      expect(refused.reply).toMatchObject(error('activity_game_running'));
      expect(refused.state).toBe(running);
      expect(refused.broadcast).toEqual([]);
    }
    // Ending the game returns it to idle, where rounds can change again.
    const reset = action(done, host, { kind: 'game.reset' }).state;
    expect(
      action(reset, host, late).state.liveActivities?.game.rounds[0]?.prompt
    ).toBe('New');
  });
});
