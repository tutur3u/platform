import {
  LIVE_ACTIVITY_LIMITS,
  type LiveActivitiesSnapshot,
  type LiveActivityCommand,
} from './live-activities-schema';

type GameCommand = Extract<LiveActivityCommand, { kind: `game.${string}` }>;
type GameRound = Extract<
  GameCommand,
  { kind: 'game.set' }
>['rounds'][number] & { id: string };
type GameTurn = {
  index: number;
  endsAt: number;
  answers: Record<string, number>;
};
export type LiveActivityGame = {
  rounds: GameRound[];
  scores: Record<string, number>;
} & (
  | { phase: 'idle' }
  | ({ phase: 'question' | 'reveal' | 'done' } & GameTurn)
);
export const EMPTY_ACTIVITY_GAME: LiveActivityGame = {
  phase: 'idle',
  rounds: [],
  scores: {},
};

function startTurn(
  game: LiveActivityGame,
  index: number,
  now: number
): LiveActivityGame {
  const round = game.rounds[index];
  if (!round) return game;
  return {
    rounds: game.rounds,
    scores: game.scores,
    phase: 'question',
    index,
    answers: {},
    endsAt: now + round.seconds * 1000,
  };
}

export function applyLiveActivityGame(
  game: LiveActivityGame,
  command: GameCommand,
  participantId: string,
  now: number
): LiveActivityGame | string {
  switch (command.kind) {
    case 'game.set':
      return {
        ...EMPTY_ACTIVITY_GAME,
        rounds: command.rounds.map((round) => ({
          ...round,
          id: crypto.randomUUID(),
        })),
      };
    case 'game.start':
      if (game.phase !== 'idle' || !game.rounds.length)
        return 'activity_game_unavailable';
      return startTurn(game, 0, now);
    case 'game.reset':
      return {
        ...EMPTY_ACTIVITY_GAME,
        rounds: game.rounds.map((round) => ({
          ...round,
          id: crypto.randomUUID(),
        })),
      };
    case 'game.answer': {
      if (game.phase !== 'question' || now >= game.endsAt)
        return 'activity_game_closed';
      const round = game.rounds[game.index];
      if (
        round?.id !== command.roundId ||
        command.choice >= round.options.length
      )
        return 'activity_invalid_choice';
      if (Object.hasOwn(game.answers, participantId)) return game;
      const participants = new Set([
        ...Object.keys(game.scores),
        ...Object.keys(game.answers),
      ]);
      if (
        !participants.has(participantId) &&
        participants.size >= LIVE_ACTIVITY_LIMITS.actors
      )
        return 'activity_full';
      return {
        ...game,
        answers: { ...game.answers, [participantId]: command.choice },
      };
    }
    case 'game.reveal': {
      if (game.phase === 'reveal' || game.phase === 'done') return game;
      if (game.phase !== 'question') return 'activity_game_unavailable';
      const scores = { ...game.scores };
      const correct = game.rounds[game.index]?.answer;
      for (const [id, answer] of Object.entries(game.answers))
        scores[id] = (scores[id] ?? 0) + (answer === correct ? 100 : 0);
      return { ...game, phase: 'reveal', scores };
    }
    case 'game.next':
      if (game.phase === 'done') return game;
      if (game.phase !== 'reveal') return 'activity_game_unavailable';
      return game.index + 1 >= game.rounds.length
        ? { ...game, phase: 'done' }
        : startTurn(game, game.index + 1, now);
  }
}

export function liveGameSnapshot(
  game: LiveActivityGame
): LiveActivitiesSnapshot['game'] {
  const active = game.phase !== 'idle' ? game.rounds[game.index] : undefined;
  const round =
    game.phase !== 'idle' && active
      ? {
          id: active.id,
          index: game.index,
          total: game.rounds.length,
          prompt: active.prompt,
          options: active.options,
          endsAt: game.endsAt,
          ...(game.phase === 'question' ? {} : { correct: active.answer }),
        }
      : undefined;
  return {
    phase: game.phase,
    round,
    answered: game.phase === 'idle' ? 0 : Object.keys(game.answers).length,
    scores: Object.entries(game.scores)
      .map(([participantId, score]) => ({ participantId, score }))
      .sort(
        (a, b) =>
          b.score - a.score || a.participantId.localeCompare(b.participantId)
      ),
  };
}
