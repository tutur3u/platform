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

/**
 * Whether rooms offer the assessment. When false the room refuses every
 * assessment command and leaves assessment out of every view, and the
 * Activities menu and the co-host list no longer offer it. The other
 * activities and the pen board do not depend on it.
 */
export const MEET_LIVE_ASSESSMENT_ENABLED: boolean = true;

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
  // Manager commands name the attempt on the sender's screen, and a status
  // change the status it leaves, so one written for another state is refused.
  z.object({
    kind: z.literal('assessment.status'),
    status: assessmentStatusSchema,
    attemptId: id.nullable(),
    from: assessmentStatusSchema,
  }),
  /** Discards a closed attempt's answers and opens the questions again. */
  z.object({ kind: z.literal('assessment.restart'), attemptId: id.nullable() }),
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
    attemptId: id.nullable(),
    itemId: id,
    participantId: id,
    /** The answer the grader read; a grade for a replaced answer is refused. */
    revision: z.number().int().nonnegative(),
    score: z.number().min(0).max(100),
    feedback: z.string().trim().max(400).optional(),
  }),
  z.object({
    kind: z.literal('assessment.release'),
    released: z.boolean(),
    attemptId: id.nullable(),
  }),
  z.object({
    kind: z.literal('flashcards.set'),
    cards: z.array(flashcardSchema).max(LIVE_ACTIVITY_LIMITS.flashcards),
  }),
  z.object({
    kind: z.literal('flashcards.show'),
    /** The card the sender saw at `index`; another card there is refused. */
    cardId: id,
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
  // Both name the round on the sender's screen; another round is refused.
  z.object({ kind: z.literal('game.next'), roundId: id }),
  z.object({ kind: z.literal('game.reveal'), roundId: id }),
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
  z.object({
    kind: z.literal('icebreaker.respond'),
    /** The prompt being answered; a reply to an earlier one is refused. */
    promptId: id,
    text: text(200),
  }),
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
    /** Issued by the room per attempt; null before any questions are saved. */
    attemptId: id.nullable(),
    released: z.boolean(),
    /**
     * True once results went out in this attempt. It takes no more answers,
     * and opening again starts a new attempt.
     */
    sealed: z.boolean(),
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
    // The room gets fronts only. A back is present for the one card the host
    // is showing, and only while that card is flipped.
    cards: z
      .array(z.object({ id, front: text(200), back: text(400).optional() }))
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
    /** Issued by the room for each prompt, so a reply names what it answers. */
    promptId: id.nullable(),
    responses: z.array(icebreakerResponse).max(LIVE_ACTIVITY_LIMITS.actors),
  }),
});
export const liveActivitiesMineSchema = z.object({
  assessment: z.record(id, responseBody),
  flashcards: z.object({
    known: z.array(id).max(LIVE_ACTIVITY_LIMITS.flashcards),
  }),
  game: z.object({ roundId: id.optional(), choice: optionIndex.optional() }),
  // The reply names its prompt, so it is never read as one to a later prompt.
  icebreaker: z.object({
    promptId: id.optional(),
    text: text(200).optional(),
  }),
});
export const liveActivitiesHostSchema = z.object({
  assessment: z.object({
    responses: z.array(
      responseBody.extend({
        itemId: id,
        participantId: id,
        /** Counts replacements of this answer; a grade names the one it read. */
        revision: z.number().int().nonnegative(),
      })
    ),
    /** Answer keys of choice items, so a manager can review before release. */
    answers: z.record(id, optionIndex),
  }),
  flashcards: z.object({
    /** The whole deck with both sides; the room never gets a hidden back. */
    cards: z
      .array(flashcardSchema.extend({ id }))
      .max(LIVE_ACTIVITY_LIMITS.flashcards),
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
