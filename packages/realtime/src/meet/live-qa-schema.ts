import { z } from 'zod';

/**
 * Bounds for a room's Live Q&A. The stored state stays well under the
 * 256 KiB signaling frame, so a full snapshot always fits one message, and
 * leaves room for the other fields of the Durable Object snapshot.
 */
export const LIVE_QA_LIMITS = {
  questions: 200,
  questionChars: 400,
  answersPerQuestion: 20,
  answerChars: 1000,
  attachmentsPerPost: 4,
  authorChars: 120,
  actionsPerMinute: 20,
  stateBytes: 192 * 1024,
} as const;

export const LIVE_QA_LENGTH_CAP = LIVE_QA_LIMITS.questionChars;
export const LIVE_QA_ACTIONS_PER_MINUTE = LIVE_QA_LIMITS.actionsPerMinute;

const requestId = z.string().trim().min(1).max(120).optional();
const questionId = z.uuid();
/** Files from the room's upload route, as for chat. */
const attachmentIds = z
  .array(z.uuid())
  .max(LIVE_QA_LIMITS.attachmentsPerPost)
  .optional();

export const liveQaSettingsSchema = z.object({
  /** Whether people may ask without their name. Hosts still see the author. */
  anonymous: z.boolean(),
  /** Who may answer: everyone admitted, or hosts only. */
  answers: z.enum(['everyone', 'hosts']),
});
export type LiveQaSettings = z.infer<typeof liveQaSettingsSchema>;
export const DEFAULT_LIVE_QA_SETTINGS: LiveQaSettings = {
  anonymous: false,
  answers: 'everyone',
};

export const liveQaAnswerSchema = z.object({
  id: z.string(),
  participantId: z.string(),
  authorName: z.string().optional(),
  text: z.string().max(LIVE_QA_LIMITS.answerChars),
  attachmentIds: z.array(z.string()).max(LIVE_QA_LIMITS.attachmentsPerPost),
  createdAt: z.string(),
  byHost: z.boolean(),
});
export type LiveQaAnswer = z.infer<typeof liveQaAnswerSchema>;

/**
 * A question as clients receive it. Every field after `hidden` is optional so
 * pages built before them keep reading the snapshot.
 */
export const liveQaQuestionSchema = z.object({
  id: z.string(),
  /** Empty in the shared view of an anonymous question. */
  participantId: z.string(),
  text: z.string().max(LIVE_QA_LENGTH_CAP),
  /**
   * Room actor keys (account id, or room id for a guest) that upvoted. Only
   * the host view fills it; the shared view sends an empty list and the count.
   */
  upvotes: z.array(z.string()),
  upvoteCount: z.number().int().min(0).optional(),
  answered: z.boolean(),
  hidden: z.boolean(),
  authorName: z.string().optional(),
  createdAt: z.string().optional(),
  pinned: z.boolean().optional(),
  anonymous: z.boolean().optional(),
  attachmentIds: z
    .array(z.string())
    .max(LIVE_QA_LIMITS.attachmentsPerPost)
    .optional(),
  answers: z
    .array(liveQaAnswerSchema)
    .max(LIVE_QA_LIMITS.answersPerQuestion)
    .optional(),
});
export type LiveQaQuestion = z.infer<typeof liveQaQuestionSchema>;

export const liveQaSnapshotSchema = z.object({
  questions: z.array(liveQaQuestionSchema).max(LIVE_QA_LIMITS.questions),
  settings: liveQaSettingsSchema.optional(),
  /** Increases with every change, so a client can tell which view is newer. */
  revision: z.number().int().min(0).optional(),
});
export type LiveQaSnapshot = z.infer<typeof liveQaSnapshotSchema>;

/** Who the room counts as this connection, sent only to that connection. */
export type LiveQaSelf = {
  actor: string;
  participantId: string;
  /** An anonymous guest, who cannot upload or read room files. */
  guest?: boolean;
  /** The questions this person upvoted. */
  votedIds?: string[];
};

/** The server's record, which also keeps each author's actor key. */
export type StoredLiveQaAnswer = LiveQaAnswer & { actor?: string };
export type StoredLiveQaQuestion = Omit<
  LiveQaQuestion,
  'answers' | 'upvoteCount'
> & {
  actor?: string;
  answers?: StoredLiveQaAnswer[];
};
export type LiveQaState = {
  questions: StoredLiveQaQuestion[];
  settings?: LiveQaSettings;
  revision?: number;
};

export const liveQaClientMessages = [
  z.object({ type: z.literal('qa.read'), requestId }),
  z.object({
    type: z.literal('qa.ask'),
    text: z.string().trim().min(1).max(LIVE_QA_LENGTH_CAP),
    anonymous: z.boolean().optional(),
    attachmentIds,
    requestId,
  }),
  z.object({
    type: z.literal('qa.upvote'),
    questionId,
    upvoted: z.boolean(),
    requestId,
  }),
  z.object({
    type: z.literal('qa.moderate'),
    questionId,
    field: z.enum(['hidden', 'answered']),
    value: z.boolean(),
    requestId,
  }),
  z.object({
    type: z.literal('qa.pin'),
    questionId,
    pinned: z.boolean(),
    requestId,
  }),
  z.object({
    type: z.literal('qa.answer'),
    questionId,
    text: z.string().max(LIVE_QA_LIMITS.answerChars),
    attachmentIds,
    requestId,
  }),
  z.object({
    type: z.literal('qa.answer.delete'),
    questionId,
    answerId: z.uuid(),
    requestId,
  }),
  z.object({
    type: z.literal('qa.settings'),
    anonymous: z.boolean().optional(),
    answers: liveQaSettingsSchema.shape.answers.optional(),
    requestId,
  }),
  z.object({ type: z.literal('qa.clear'), requestId }),
] as const;

export type LiveQaClientMessage = z.infer<
  (typeof liveQaClientMessages)[number]
>;

export type LiveQaServerMessage =
  | {
      type: 'qa.snapshot';
      snapshot: LiveQaSnapshot;
      /** Present only on replies to this connection's own requests. */
      self?: LiveQaSelf;
      requestId?: string;
    }
  | {
      /** The full view, including hidden questions and anonymous authors. */
      type: 'qa.host';
      snapshot: LiveQaSnapshot;
      requestId?: string;
    };

/** Characters a question, answer or name never keeps. */
function dropped(code: number) {
  if (code === 9 || code === 10) return false;
  return (
    code < 32 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x200b ||
    code === 0x200e ||
    code === 0x200f ||
    code === 0xfeff ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/**
 * Text as the room stores it: control and bidirectional override characters
 * removed, at most one blank line in a row, and no surrounding whitespace.
 */
export function cleanLiveQaText(value: string) {
  return Array.from(value)
    .filter((character) => !dropped(character.codePointAt(0) ?? 0))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
