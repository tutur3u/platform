import { serializedMeetBytes } from './live-activity-rate';
import {
  cleanLiveQaText,
  DEFAULT_LIVE_QA_SETTINGS,
  LIVE_QA_LIMITS,
  type LiveQaClientMessage,
  type LiveQaState,
  type StoredLiveQaQuestion,
} from './live-qa-schema';
import {
  claimLiveQaFiles,
  liveQaQuestionFiles,
  releaseLiveQaFiles,
  withholdLiveQaFiles,
} from './live-qa-files';
import { liveQaDelivery, liveQaReplies } from './live-qa-views';
import type { MeetRoomCommand, MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';

export {
  LIVE_QA_ACTIONS_PER_MINUTE,
  LIVE_QA_LENGTH_CAP,
  LIVE_QA_LIMITS,
  type LiveQaSnapshot,
  liveQaQuestionSchema,
  liveQaSnapshotSchema,
} from './live-qa-schema';

export type LiveQaRoomState = {
  liveQa?: LiveQaState;
  liveQaLimits?: Record<string, { resetAt: number; count: number }>;
};
declare module './room' {
  interface MeetRoomSnapshot extends LiveQaRoomState {}
}
export const EMPTY_LIVE_QA: LiveQaState = { questions: [] };
export function liveQaSnapshot(state: MeetRoomSnapshot & LiveQaRoomState) {
  return state.liveQa ?? EMPTY_LIVE_QA;
}

const HOST_ONLY = new Set<LiveQaClientMessage['type']>([
  'qa.moderate',
  'qa.pin',
  'qa.settings',
  'qa.clear',
]);
/** Commands that add to the stored state and so are bounded by its size. */
const GROWING = new Set<LiveQaClientMessage['type']>([
  'qa.ask',
  'qa.answer',
  'qa.upvote',
]);

type Actor = {
  actor: string;
  participantId: string;
  isHost: boolean;
  authorName?: string;
  now: string;
};
type Change = {
  qa: LiveQaState;
  attachments?: MeetRoomSnapshot['attachments'];
};

function authorName(state: MeetRoomSnapshot, token: MeetRoomCommand['token']) {
  const name = cleanLiveQaText(
    state.presence[token.userId]?.displayName ?? token.displayName ?? ''
  ).slice(0, LIVE_QA_LIMITS.authorChars);
  return name || undefined;
}

function updateQuestion(
  qa: LiveQaState,
  questionId: string,
  update: (question: StoredLiveQaQuestion) => StoredLiveQaQuestion | string
): LiveQaState | string {
  const index = qa.questions.findIndex(
    (question) => question.id === questionId
  );
  const question = qa.questions[index];
  if (!question) return 'qa_not_found';
  const next = update(question);
  if (typeof next === 'string') return next;
  const questions = [...qa.questions];
  questions[index] = next;
  return { ...qa, questions };
}

function answer(
  state: MeetRoomSnapshot,
  qa: LiveQaState,
  message: Extract<LiveQaClientMessage, { type: 'qa.answer' }>,
  who: Actor
): Change | string {
  if ((qa.settings?.answers ?? 'everyone') === 'hosts' && !who.isHost)
    return 'permission_denied';
  const text = cleanLiveQaText(message.text);
  const ids = message.attachmentIds ?? [];
  if (text.length > LIVE_QA_LIMITS.answerChars || (!text && !ids.length))
    return 'qa_invalid_length';
  const attachments = claimLiveQaFiles(state, ids, who.actor);
  if (typeof attachments === 'string') return attachments;
  const next = updateQuestion(qa, message.questionId, (question) => {
    if (question.hidden) return 'qa_not_found';
    const answers = question.answers ?? [];
    if (answers.length >= LIVE_QA_LIMITS.answersPerQuestion)
      return 'qa_answers_full';
    return {
      ...question,
      answers: [
        ...answers,
        {
          id: crypto.randomUUID(),
          participantId: who.participantId,
          actor: who.actor,
          ...(who.authorName ? { authorName: who.authorName } : {}),
          text,
          attachmentIds: ids,
          createdAt: who.now,
          byHost: who.isHost,
        },
      ],
    };
  });
  return typeof next === 'string'
    ? next
    : { qa: next, attachments: ids.length ? attachments : undefined };
}

function deleteAnswer(
  state: MeetRoomSnapshot,
  qa: LiveQaState,
  message: Extract<LiveQaClientMessage, { type: 'qa.answer.delete' }>,
  who: Actor
): Change | string {
  let removed: string[] = [];
  const next = updateQuestion(qa, message.questionId, (question) => {
    const answers = question.answers ?? [];
    const target = answers.find((entry) => entry.id === message.answerId);
    if (!target) return 'qa_not_found';
    if (!who.isHost && (target.actor ?? target.participantId) !== who.actor)
      return 'permission_denied';
    removed = target.attachmentIds;
    return {
      ...question,
      answers: answers.filter((entry) => entry.id !== message.answerId),
    };
  });
  if (typeof next === 'string') return next;
  if (!removed.length) return { qa: next };
  return {
    qa: next,
    attachments: releaseLiveQaFiles(state.attachments, removed),
  };
}

function reduce(
  state: MeetRoomSnapshot,
  qa: LiveQaState,
  message: Exclude<LiveQaClientMessage, { type: 'qa.read' }>,
  who: Actor
): Change | string {
  const settings = qa.settings ?? DEFAULT_LIVE_QA_SETTINGS;
  switch (message.type) {
    case 'qa.ask': {
      const text = cleanLiveQaText(message.text);
      if (!text || text.length > LIVE_QA_LIMITS.questionChars)
        return 'qa_invalid_length';
      if (message.anonymous && !settings.anonymous)
        return 'qa_anonymous_disabled';
      if (qa.questions.length >= LIVE_QA_LIMITS.questions) return 'qa_full';
      const ids = message.attachmentIds ?? [];
      const attachments = claimLiveQaFiles(state, ids, who.actor);
      if (typeof attachments === 'string') return attachments;
      return {
        attachments: ids.length ? attachments : undefined,
        qa: {
          ...qa,
          questions: [
            ...qa.questions,
            {
              id: crypto.randomUUID(),
              participantId: who.participantId,
              actor: who.actor,
              ...(who.authorName ? { authorName: who.authorName } : {}),
              text,
              upvotes: [],
              answered: false,
              hidden: false,
              pinned: false,
              ...(message.anonymous ? { anonymous: true } : {}),
              attachmentIds: ids,
              createdAt: who.now,
              answers: [],
            },
          ],
        },
      };
    }
    case 'qa.upvote': {
      const next = updateQuestion(qa, message.questionId, (question) =>
        question.hidden
          ? 'qa_not_found'
          : {
              ...question,
              upvotes: message.upvoted
                ? [...new Set([...question.upvotes, who.actor])]
                : question.upvotes.filter((id) => id !== who.actor),
            }
      );
      return typeof next === 'string' ? next : { qa: next };
    }
    case 'qa.moderate': {
      let files: string[] = [];
      const next = updateQuestion(qa, message.questionId, (question) => {
        if (message.field === 'hidden') files = liveQaQuestionFiles(question);
        return {
          ...question,
          [message.field]: message.value,
          // A hidden question leaves the screen too.
          ...(message.field === 'hidden' && message.value
            ? { pinned: false }
            : {}),
        };
      });
      if (typeof next === 'string') return next;
      return {
        qa: next,
        attachments: files.length
          ? withholdLiveQaFiles(state.attachments, files, message.value)
          : undefined,
      };
    }
    case 'qa.pin': {
      const target = qa.questions.find((q) => q.id === message.questionId);
      if (!target || (target.hidden && message.pinned)) return 'qa_not_found';
      // One question is on screen at a time; pinning another replaces it.
      return {
        qa: {
          ...qa,
          questions: qa.questions.map((question) =>
            question.id === message.questionId
              ? { ...question, pinned: message.pinned }
              : message.pinned && question.pinned
                ? { ...question, pinned: false }
                : question
          ),
        },
      };
    }
    case 'qa.answer':
      return answer(state, qa, message, who);
    case 'qa.answer.delete':
      return deleteAnswer(state, qa, message, who);
    case 'qa.settings':
      return {
        qa: {
          ...qa,
          settings: {
            anonymous: message.anonymous ?? settings.anonymous,
            answers: message.answers ?? settings.answers,
          },
        },
      };
    case 'qa.clear': {
      const files = qa.questions
        .filter((question) => question.hidden)
        .flatMap(liveQaQuestionFiles);
      return {
        attachments: files.length
          ? withholdLiveQaFiles(state.attachments, files, false)
          : undefined,
        qa: {
          ...qa,
          questions: qa.questions.map((question) => ({
            ...question,
            hidden: false,
            answered: false,
            pinned: false,
          })),
        },
      };
    }
  }
}

export function applyLiveQa(
  state: MeetRoomSnapshot & LiveQaRoomState,
  { message: frame, token, now }: MeetRoomCommand
) {
  if (!frame.type.startsWith('qa.')) return null;
  const message = frame as LiveQaClientMessage;
  const { requestId } = message;
  if (
    state.ended ||
    !state.presence[token.userId] ||
    state.waiting[token.userId]
  )
    return denied(state, 'awaiting_admission', requestId);
  const current = liveQaSnapshot(state);
  if (message.type === 'qa.read')
    return outcome(state, { reply: liveQaReplies(current, token, requestId) });
  const isHost = token.role === 'host';
  if (HOST_ONLY.has(message.type) && !isHost)
    return denied(state, 'permission_denied', requestId);
  const timestamp = Date.parse(now);
  const limits = Object.fromEntries(
    Object.entries(state.liveQaLimits ?? {}).filter(
      ([, bucket]) => timestamp < bucket.resetAt
    )
  );
  const actor = token.accountId ?? token.userId;
  const bucket = limits[actor] ?? { resetAt: timestamp + 60_000, count: 0 };
  if (bucket.count >= LIVE_QA_LIMITS.actionsPerMinute)
    return denied(state, 'qa_rate_limited', requestId);
  const change = reduce(state, current, message, {
    actor,
    participantId: token.userId,
    isHost,
    authorName: authorName(state, token),
    now,
  });
  if (typeof change === 'string') return denied(state, change, requestId);
  const qa = { ...change.qa, revision: (current.revision ?? 0) + 1 };
  if (
    GROWING.has(message.type) &&
    serializedMeetBytes(qa) > LIVE_QA_LIMITS.stateBytes
  )
    return denied(state, 'qa_full', requestId);
  const next: MeetRoomSnapshot = {
    ...state,
    liveQa: qa,
    liveQaLimits: {
      ...limits,
      [actor]: { ...bucket, count: bucket.count + 1 },
    },
    ...(change.attachments ? { attachments: change.attachments } : {}),
  };
  return outcome(next, liveQaDelivery(next, qa, token, requestId));
}
