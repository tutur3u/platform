import { z } from 'zod';

export const LIVE_ACTIVITY_LIMITS = {
  assessmentItems: 20,
  flashcards: 60,
  gameRounds: 30,
  actors: 128,
  // Leave room for the other room fields in the SQLite DO snapshot, and for
  // the envelope and request ID under the 256 KiB signaling frame limit.
  stateBytes: 256 * 1024,
  viewBytes: 112 * 1024,
} as const;

export const liveActivityRequestIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .optional();
const id = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionIndex = z.number().int().min(0).max(5);
const options = z.array(text(120)).min(2).max(6);
export const assessmentStatusSchema = z.enum(['draft', 'open', 'closed']);
const assessmentItemSchema = z
  .object({
    prompt: text(240),
    kind: z.enum(['short', 'long', 'choice']),
    options: options.optional(),
    answer: optionIndex.optional(),
  })
  .refine((item) =>
    item.kind === 'choice'
      ? item.options !== undefined &&
        (item.answer === undefined || item.answer < item.options.length)
      : item.options === undefined && item.answer === undefined
  );
const flashcardSchema = z.object({ front: text(200), back: text(400) });
const gameRoundSchema = z
  .object({
    prompt: text(240),
    options,
    answer: optionIndex,
    seconds: z.number().int().min(5).max(120),
  })
  .refine((round) => round.answer < round.options.length);

export const liveActivityCommandSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('assessment.set'),
    items: z
      .array(assessmentItemSchema)
      .max(LIVE_ACTIVITY_LIMITS.assessmentItems),
  }),
  z.object({
    kind: z.literal('assessment.status'),
    status: assessmentStatusSchema,
  }),
  z
    .object({
      kind: z.literal('assessment.submit'),
      itemId: id,
      answer: text(2000).optional(),
      choice: optionIndex.optional(),
    })
    .refine(
      ({ answer, choice }) => (answer === undefined) !== (choice === undefined)
    ),
  z.object({
    kind: z.literal('assessment.grade'),
    itemId: id,
    participantId: id,
    score: z.number().min(0).max(100),
    feedback: z.string().trim().max(400).optional(),
  }),
  z.object({ kind: z.literal('assessment.release'), released: z.boolean() }),
  z.object({
    kind: z.literal('flashcards.set'),
    cards: z.array(flashcardSchema).max(LIVE_ACTIVITY_LIMITS.flashcards),
  }),
  z.object({
    kind: z.literal('flashcards.show'),
    index: z
      .number()
      .int()
      .min(0)
      .max(LIVE_ACTIVITY_LIMITS.flashcards - 1),
    flipped: z.boolean(),
  }),
  z.object({
    kind: z.literal('flashcards.mark'),
    cardId: id,
    known: z.boolean(),
  }),
  z.object({
    kind: z.literal('game.set'),
    rounds: z.array(gameRoundSchema).max(LIVE_ACTIVITY_LIMITS.gameRounds),
  }),
  z.object({ kind: z.literal('game.start') }),
  z.object({ kind: z.literal('game.next') }),
  z.object({ kind: z.literal('game.reveal') }),
  z.object({ kind: z.literal('game.reset') }),
  z.object({
    kind: z.literal('game.answer'),
    roundId: id,
    choice: optionIndex,
  }),
  z.object({
    kind: z.literal('icebreaker.prompt'),
    text: text(200).nullable(),
  }),
  z.object({ kind: z.literal('icebreaker.respond'), text: text(200) }),
  z.object({
    kind: z.literal('icebreaker.hide'),
    responseId: id,
    hidden: z.boolean(),
  }),
]);

export const liveActivityClientMessages = [
  z.object({
    type: z.literal('activity.read'),
    requestId: liveActivityRequestIdSchema,
  }),
  z.object({
    type: z.literal('activity.command'),
    command: liveActivityCommandSchema,
    requestId: liveActivityRequestIdSchema,
  }),
] as const;

const responseBody = z.object({
  answer: text(2000).optional(),
  choice: optionIndex.optional(),
  score: z.number().min(0).max(100).optional(),
  feedback: z.string().max(400).optional(),
});
const icebreakerResponse = z.object({ id, participantId: id, text: text(200) });
export const liveActivitiesSnapshotSchema = z.object({
  assessment: z.object({
    status: assessmentStatusSchema,
    released: z.boolean(),
    items: z
      .array(
        z.object({
          id,
          prompt: text(240),
          kind: z.enum(['short', 'long', 'choice']),
          options: options.optional(),
          correct: optionIndex.optional(),
        })
      )
      .max(LIVE_ACTIVITY_LIMITS.assessmentItems),
    counts: z.record(id, z.number().int().nonnegative()),
  }),
  flashcards: z.object({
    cards: z
      .array(flashcardSchema.extend({ id }))
      .max(LIVE_ACTIVITY_LIMITS.flashcards),
    index: z.number().int().nonnegative(),
    flipped: z.boolean(),
  }),
  game: z.object({
    phase: z.enum(['idle', 'question', 'reveal', 'done']),
    round: z
      .object({
        id,
        index: z.number().int().nonnegative(),
        total: z.number().int().positive(),
        prompt: text(240),
        options,
        endsAt: z.number().int().nonnegative(),
        correct: optionIndex.optional(),
      })
      .optional(),
    answered: z.number().int().nonnegative(),
    scores: z
      .array(
        z.object({ participantId: id, score: z.number().int().nonnegative() })
      )
      .max(LIVE_ACTIVITY_LIMITS.actors),
  }),
  icebreaker: z.object({
    prompt: text(200).nullable(),
    responses: z.array(icebreakerResponse).max(LIVE_ACTIVITY_LIMITS.actors),
  }),
});
export const liveActivitiesMineSchema = z.object({
  assessment: z.record(id, responseBody),
  flashcards: z.object({
    known: z.array(id).max(LIVE_ACTIVITY_LIMITS.flashcards),
  }),
  game: z.object({ roundId: id.optional(), choice: optionIndex.optional() }),
  icebreaker: z.object({ text: text(200).optional() }),
});
export const liveActivitiesHostSchema = z.object({
  assessment: z.object({
    responses: z.array(responseBody.extend({ itemId: id, participantId: id })),
    /** Answer keys of choice items, so a manager can review before release. */
    answers: z.record(id, optionIndex),
  }),
  flashcards: z.object({
    progress: z
      .array(
        z.object({ participantId: id, known: z.number().int().nonnegative() })
      )
      .max(LIVE_ACTIVITY_LIMITS.actors),
  }),
  /** The prepared rounds with their keys; the room only sees the live round. */
  game: z.object({
    rounds: z
      .array(
        z.object({
          id,
          prompt: text(240),
          options,
          answer: optionIndex,
          seconds: z.number().int().min(5).max(120),
        })
      )
      .max(LIVE_ACTIVITY_LIMITS.gameRounds),
  }),
  icebreaker: z.object({
    hidden: z.array(icebreakerResponse).max(LIVE_ACTIVITY_LIMITS.actors),
  }),
});
export type LiveActivityCommand = z.infer<typeof liveActivityCommandSchema>;
export type LiveActivitiesSnapshot = z.infer<
  typeof liveActivitiesSnapshotSchema
>;
export type LiveActivitiesMine = z.infer<typeof liveActivitiesMineSchema>;
export type LiveActivitiesHost = z.infer<typeof liveActivitiesHostSchema>;
export type LiveActivitiesServerMessage =
  | {
      type: 'activity.snapshot';
      snapshot: LiveActivitiesSnapshot;
      requestId?: string;
    }
  | { type: 'activity.mine'; mine: LiveActivitiesMine; requestId?: string }
  | { type: 'activity.host'; host: LiveActivitiesHost; requestId?: string };
