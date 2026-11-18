import { z } from 'zod';
import { pollDefinitionSchema, type RoomPoll } from './room-polls';

export const MAX_QUIZ_ARENA_BYTES = 512 * 1024;
export const MAX_ARENA_CATEGORIES = 6;
export const MAX_ARENA_TIERS = 5;
export const MAX_ARENA_TILES = MAX_ARENA_CATEGORIES * MAX_ARENA_TIERS;
export const MAX_ARENA_PLAYERS = 150;
export const MAX_ARENA_TEAMS = 12;
export const MAX_ARENA_BUZZ_QUEUE = 30;
export const DEFAULT_ARENA_TIER_POINTS = [100, 200, 300, 400, 500] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const timeLimitSec = z.number().int().min(5).max(300);

/**
 * Each tile question is a `kind: 'quiz'` poll question. The answer key stays
 * in the input only so the room can store it beside the question; it never
 * reaches participant projections before the tile is revealed.
 */
export const arenaQuestionInputSchema = z
  .discriminatedUnion('type', [
    z.strictObject({
      type: z.literal('single_choice'),
      question: text(240),
      options: z.array(text(120)).min(2).max(6),
      correctIndex: z.number().int().min(0).max(5),
      explanation: z.string().trim().max(500).optional(),
    }),
    z.strictObject({
      type: z.literal('open_text'),
      question: text(240),
      acceptedAnswers: z.array(text(120)).max(8).default([]),
      explanation: z.string().trim().max(500).optional(),
    }),
  ])
  .refine(
    (input) =>
      pollDefinitionSchema.safeParse(
        input.type === 'single_choice'
          ? {
              type: input.type,
              question: input.question,
              options: input.options,
            }
          : { type: input.type, question: input.question }
      ).success
  )
  .refine(
    (input) =>
      input.type !== 'single_choice' ||
      input.correctIndex < input.options.length
  );
export type ArenaQuestionInput = z.input<typeof arenaQuestionInputSchema>;

const tileInput = z.strictObject({
  categoryIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_ARENA_CATEGORIES - 1),
  tierIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_ARENA_TIERS - 1),
  question: arenaQuestionInputSchema,
  isBonusWager: z.boolean().default(false),
  timeLimitSec: timeLimitSec.optional(),
});

export const arenaBoardInputSchema = z
  .strictObject({
    title: text(120),
    source: z.enum(['manual', 'mira', 'upskii', 'starter']).default('manual'),
    categories: z.array(text(60)).min(1).max(MAX_ARENA_CATEGORIES),
    tierPoints: z
      .array(z.number().int().min(1).max(10_000))
      .min(1)
      .max(MAX_ARENA_TIERS)
      .default([...DEFAULT_ARENA_TIER_POINTS]),
    tiles: z.array(tileInput).min(1).max(MAX_ARENA_TILES),
    finalRound: z
      .strictObject({
        category: text(60),
        question: arenaQuestionInputSchema,
        timeLimitSec: timeLimitSec.optional(),
      })
      .optional(),
  })
  .refine((board) =>
    board.tiles.every(
      (tile) =>
        tile.categoryIndex < board.categories.length &&
        tile.tierIndex < board.tierPoints.length
    )
  )
  .refine(
    (board) =>
      new Set(board.tiles.map((t) => `${t.categoryIndex}:${t.tierIndex}`))
        .size === board.tiles.length
  )
  .refine((board) =>
    board.tierPoints.every(
      (points, i) => i === 0 || points >= (board.tierPoints[i - 1] ?? 0)
    )
  );
export type ArenaBoardInput = z.input<typeof arenaBoardInputSchema>;

export const arenaConfigInputSchema = z.strictObject({
  answerMode: z.enum(['buzz_in', 'all_answer']),
  playMode: z.enum(['individual', 'teams']),
  teams: z.array(text(40)).min(2).max(MAX_ARENA_TEAMS).optional(),
  autoAssignTeams: z.boolean().default(true),
  speedBonus: z.boolean().default(false),
  wrongAnswerPenalty: z.enum(['none', 'half', 'full']).default('none'),
  defaultTimeLimitSec: timeLimitSec.default(30),
  attendanceThreshold: z.number().min(0).max(1).default(0.5),
});
export type ArenaConfigInput = z.input<typeof arenaConfigInputSchema>;

const tileId = z.uuid();
const answerSchema = z.union([
  z.strictObject({ optionId: z.uuid() }),
  z.strictObject({ text: text(200) }),
]);
export type ArenaAnswer = z.infer<typeof answerSchema>;
const adjustTarget = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('player'),
    userId: z.string().min(1).max(64),
  }),
  z.strictObject({ type: z.literal('team'), teamId: z.uuid() }),
]);

/** Commands shared by the browser API and the trusted room service. */
export const quizArenaMutationSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('setup'),
    board: arenaBoardInputSchema,
    config: arenaConfigInputSchema,
  }),
  z.strictObject({
    action: z.literal('pickTile'),
    tileId,
    source: z.enum(['host', 'mira']).default('host'),
  }),
  z.strictObject({ action: z.literal('lockBuzzers'), locked: z.boolean() }),
  z.strictObject({ action: z.literal('buzz'), tileId }),
  z.strictObject({ action: z.literal('answer'), tileId, answer: answerSchema }),
  z.strictObject({
    action: z.literal('wager'),
    tileId,
    amount: z.number().int().min(0).max(1_000_000),
  }),
  z.strictObject({
    action: z.literal('judge'),
    tileId,
    userId: z.string().min(1).max(64),
    correct: z.boolean(),
  }),
  z.strictObject({ action: z.literal('revealTile'), tileId }),
  z.strictObject({ action: z.literal('skipTile'), tileId }),
  z.strictObject({
    action: z.literal('adjustPoints'),
    target: adjustTarget,
    mode: z.enum(['delta', 'set']),
    value: z.number().int().min(-1_000_000).max(1_000_000),
  }),
  z.strictObject({
    action: z.literal('startFinalRound'),
    stage: z.enum(['wager', 'answer']).default('wager'),
  }),
  z.strictObject({ action: z.literal('endGame') }),
  z.strictObject({ action: z.literal('reset') }),
]);
export type QuizArenaMutation = z.input<typeof quizArenaMutationSchema>;

export type QuizArenaMutationCommand = z.output<typeof quizArenaMutationSchema>;

const readCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('arena.state'),
    sinceSeq: z.number().int().min(0).optional(),
  }),
  z.strictObject({
    action: z.literal('arena.export'),
    format: z.enum(['csv', 'json']),
  }),
  z.strictObject({ action: z.literal('arena.authorize') }),
]);

const mutationActions = new Set<string>(
  quizArenaMutationSchema.options.map((option) => option.shape.action.value)
);

/**
 * Room-service commands use an `arena.` prefix. Mutations reuse the browser
 * schema after the prefix is removed, so both entry points validate alike.
 */
export const quizArenaRoomCommandSchema = z.union([
  readCommandSchema,
  z
    .looseObject({ action: z.string().regex(/^arena\.[a-zA-Z]+$/u) })
    .refine((input) => mutationActions.has(input.action.slice(6)))
    .transform((input, ctx) => {
      const parsed = quizArenaMutationSchema.safeParse({
        ...input,
        action: input.action.slice(6),
      });
      if (parsed.success) return parsed.data;
      ctx.addIssue({ code: 'custom', message: 'Invalid arena command' });
      return z.NEVER;
    }),
]);
export type QuizArenaRoomCommand = z.output<typeof quizArenaRoomCommandSchema>;

type QuizMeta = NonNullable<RoomPoll['quizMeta']>;
export type ArenaQuestion = {
  kind: 'quiz';
  type: 'single_choice' | 'open_text';
  question: string;
  options?: Array<{ id: string; label: string }>;
  quizMeta: QuizMeta & { timeLimitSec: number; points: number };
  /** Normalized short answers that auto-grade an open-text tile. */
  acceptedAnswers?: string[];
};

export type ArenaSubmission = {
  userId: string;
  answer: ArenaAnswer;
  submittedAt: number;
  correct: boolean | null;
};
export type ArenaBuzz = {
  userId: string;
  buzzedAt: number;
  status: 'waiting' | 'answering' | 'correct' | 'wrong';
};
export type ArenaTileStatus = 'available' | 'active' | 'revealed' | 'skipped';
export type ArenaTile = {
  id: string;
  categoryIndex: number;
  tierIndex: number;
  points: number;
  isBonusWager: boolean;
  isFinal: boolean;
  status: ArenaTileStatus;
  question: ArenaQuestion;
  openedAt?: number;
  submissions: ArenaSubmission[];
  buzzQueue: ArenaBuzz[];
  /** Keyed by player account ID, or `team:<id>` in team play. */
  wagers: Record<string, number>;
  /** Players who placed or changed a wager, for attendance credit. */
  wagerBy?: string[];
  /** Points applied per player (or `team:<id>`) for this tile, so re-judging stays exact. */
  awards: Record<string, number>;
  v: number;
};
export type ArenaPlayer = {
  userId: string;
  displayName: string;
  teamId?: string;
  score: number;
  lastDelta: number;
  participatedRounds: number;
  v: number;
};
export type ArenaTeam = {
  id: string;
  name: string;
  score: number;
  lastDelta: number;
  v: number;
};
export type ArenaPhase =
  | 'board'
  | 'question'
  | 'final_wager'
  | 'final_answer'
  | 'ended';
export type ArenaConfig = z.output<typeof arenaConfigInputSchema>;
export type RoomQuizArenaState = {
  epoch: string;
  /** Monotonic across setups and resets; deltas never span `baseSeq`. */
  seq: number;
  baseSeq: number;
  metaV: number;
  title: string;
  categories: string[];
  finalCategory?: string;
  tierPoints: number[];
  config: ArenaConfig;
  source: 'manual' | 'mira' | 'upskii' | 'starter';
  phase: ArenaPhase;
  activeTileId: string | null;
  pickedBy: 'host' | 'mira' | null;
  buzzersLocked: boolean;
  tiles: ArenaTile[];
  finalTile?: ArenaTile;
  players: Record<string, ArenaPlayer>;
  teams: ArenaTeam[];
};
