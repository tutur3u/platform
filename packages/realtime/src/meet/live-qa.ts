import { z } from 'zod';
import type { MeetRoomCommand, MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';

export const LIVE_QA_LENGTH_CAP = 400;
export const LIVE_QA_ACTIONS_PER_MINUTE = 20;
export const liveQaQuestionSchema = z.object({
  id: z.string(),
  participantId: z.string(),
  text: z.string().max(LIVE_QA_LENGTH_CAP),
  upvotes: z.array(z.string()),
  answered: z.boolean(),
  hidden: z.boolean(),
});
export const liveQaSnapshotSchema = z.object({
  questions: z.array(liveQaQuestionSchema).max(200),
});
export type LiveQaSnapshot = z.infer<typeof liveQaSnapshotSchema>;
export type LiveQaRoomState = {
  liveQa?: LiveQaSnapshot;
  liveQaLimits?: Record<string, { resetAt: number; count: number }>;
};
declare module './room' {
  interface MeetRoomSnapshot extends LiveQaRoomState {}
}
export const EMPTY_LIVE_QA: LiveQaSnapshot = { questions: [] };
export function liveQaSnapshot(state: MeetRoomSnapshot & LiveQaRoomState) {
  return state.liveQa ?? EMPTY_LIVE_QA;
}

export function applyLiveQa(
  state: MeetRoomSnapshot & LiveQaRoomState,
  { message, token, now }: MeetRoomCommand
) {
  if (!message.type.startsWith('qa.')) return null;
  const requestId = 'requestId' in message ? message.requestId : undefined;
  if (
    state.ended ||
    !state.presence[token.userId] ||
    state.waiting[token.userId]
  )
    return denied(state, 'awaiting_admission', requestId);
  if (message.type === 'qa.read')
    return outcome(state, {
      reply: [
        { type: 'qa.snapshot', snapshot: liveQaSnapshot(state), requestId },
      ],
    });
  if (
    (message.type === 'qa.moderate' || message.type === 'qa.clear') &&
    token.role !== 'host'
  )
    return denied(state, 'permission_denied', requestId);
  const timestamp = Date.parse(now);
  const limits = Object.fromEntries(
    Object.entries(state.liveQaLimits ?? {}).filter(
      ([, bucket]) => timestamp < bucket.resetAt
    )
  );
  const actor = token.accountId ?? token.userId;
  const bucket = limits[actor] ?? { resetAt: timestamp + 60_000, count: 0 };
  if (bucket.count >= LIVE_QA_ACTIONS_PER_MINUTE)
    return denied(state, 'qa_rate_limited', requestId);
  let questions = liveQaSnapshot(state).questions;
  switch (message.type) {
    case 'qa.ask': {
      const text = message.text.trim();
      if (!text || text.length > LIVE_QA_LENGTH_CAP)
        return denied(state, 'qa_invalid_length', requestId);
      if (questions.length >= 200) return denied(state, 'qa_full', requestId);
      questions = [
        ...questions,
        {
          id: crypto.randomUUID(),
          participantId: token.userId,
          text,
          upvotes: [],
          answered: false,
          hidden: false,
        },
      ];
      break;
    }
    case 'qa.upvote':
      questions = questions.map((q) =>
        q.id !== message.questionId || q.hidden
          ? q
          : {
              ...q,
              upvotes: message.upvoted
                ? [...new Set([...q.upvotes, actor])]
                : q.upvotes.filter((id) => id !== actor),
            }
      );
      break;
    case 'qa.moderate':
      questions = questions.map((q) =>
        q.id === message.questionId
          ? {
              ...q,
              [message.field]: message.value,
            }
          : q
      );
      break;
    case 'qa.clear':
      questions = questions.map((q) => ({
        ...q,
        hidden: false,
        answered: false,
      }));
      break;
    default:
      return null;
  }
  const snapshot = { questions };
  return outcome(
    {
      ...state,
      liveQa: snapshot,
      liveQaLimits: {
        ...limits,
        [actor]: { ...bucket, count: bucket.count + 1 },
      },
    },
    {
      broadcast: [{ type: 'qa.snapshot', snapshot }],
      reply: [{ type: 'qa.snapshot', snapshot, requestId }],
    }
  );
}
