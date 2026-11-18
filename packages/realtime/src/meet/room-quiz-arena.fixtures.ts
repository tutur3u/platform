import { meetRealtimeTokenPayloadSchema } from './index';
import {
  type ArenaBoardInput,
  type ArenaConfigInput,
  projectQuizArenaForUser,
  type QuizArenaFullView,
  type RoomQuizArenaState,
} from './room-quiz-arena';
import { type RoomServiceState, roomService } from './room-service';

/** Shared Quiz Arena test fixtures: tokens, a present roster and a small board. */
export const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const base = meetRealtimeTokenPayloadSchema.parse({
  exp: 2000000000,
  limits: {},
  meetingId: uuid(9999),
  mode: 'call',
  role: 'speaker',
  roomId: 'room',
  scopes: ['meet:server'],
  userId: uuid(1),
  accountId: uuid(1),
  wsId: uuid(9998),
});
export const host = {
  ...base,
  role: 'host' as const,
  userId: uuid(0),
  accountId: uuid(0),
  scopes: [...base.scopes, 'participants:manage'] as typeof base.scopes,
};
export const player = (n: number) => ({
  ...base,
  userId: uuid(n),
  accountId: uuid(n),
  displayName: `Player ${n}`,
});

export function room(count: number): RoomServiceState {
  const presence: RoomServiceState['presence'] = {};
  for (let n = 1; n <= count; n++)
    presence[uuid(n)] = {
      userId: uuid(n),
      accountId: uuid(n),
      displayName: `Player ${n}`,
      joinedAt: '2026-11-18T00:00:00Z',
      lastSeenAt: '2026-11-18T00:00:00Z',
      media: { audio: false, video: false, screen: false },
      role: 'speaker',
    } as RoomServiceState['presence'][string];
  return { presence, approved: {} } as unknown as RoomServiceState;
}

export const board = (
  overrides: Partial<ArenaBoardInput> = {}
): ArenaBoardInput => ({
  title: 'Lecture 04 review',
  categories: ['Recursion', 'Big-O'],
  tierPoints: [100, 200],
  tiles: [
    {
      categoryIndex: 0,
      tierIndex: 0,
      question: {
        type: 'single_choice',
        question: 'Base case of factorial?',
        options: ['n = 0', 'n = 10', '=HYPERLINK("x")'],
        correctIndex: 0,
        explanation: 'Stops the recursion.',
      },
    },
    {
      categoryIndex: 0,
      tierIndex: 1,
      isBonusWager: true,
      question: {
        type: 'open_text',
        question: 'Name the call stack overflow error in Python',
        acceptedAnswers: ['RecursionError'],
      },
    },
    {
      categoryIndex: 1,
      tierIndex: 0,
      question: {
        type: 'open_text',
        question: 'Explain O(n log n) in a sentence',
      },
    },
  ],
  finalRound: {
    category: 'Recursion',
    question: {
      type: 'single_choice',
      question: 'Which data structure backs recursion?',
      options: ['Stack', 'Queue'],
      correctIndex: 0,
    },
  },
  ...overrides,
});

export function run(
  state: RoomServiceState,
  token: typeof base,
  command: unknown
) {
  const result = roomService(state, token, command);
  return result;
}
export function ok(
  state: RoomServiceState,
  token: typeof base,
  command: unknown
) {
  const result = run(state, token, command);
  if (result.status)
    throw new Error(
      `${JSON.stringify(command)} → ${result.status} ${JSON.stringify(result.body)}`
    );
  return result.state;
}
export function setup(config: ArenaConfigInput, count = 3, input = board()) {
  return ok(room(count), host, { action: 'arena.setup', board: input, config });
}
export const arena = (state: RoomServiceState) =>
  state.quizArena as RoomQuizArenaState;
export const view = (state: RoomServiceState, n: number, manage = false) =>
  projectQuizArenaForUser(arena(state), uuid(n), manage) as QuizArenaFullView;
