import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomOutcome, MeetRoomSnapshot } from './room';
import {
  DEFAULT_LIVE_QA_SETTINGS,
  type LiveQaQuestion,
  type LiveQaServerMessage,
  type LiveQaSnapshot,
  type LiveQaState,
  type StoredLiveQaQuestion,
} from './live-qa-schema';

function wire(question: StoredLiveQaQuestion): LiveQaQuestion {
  const { actor: _actor, answers, ...rest } = question;
  return {
    ...rest,
    upvoteCount: question.upvotes.length,
    answers: (answers ?? []).map(
      ({ actor: _answerActor, ...answer }) => answer
    ),
  };
}

function view(qa: LiveQaState, questions: LiveQaQuestion[]): LiveQaSnapshot {
  return {
    questions,
    settings: qa.settings ?? DEFAULT_LIVE_QA_SETTINGS,
    revision: qa.revision ?? 0,
  };
}

/** Everything the room keeps, for hosts. Actor keys never leave the server. */
export function liveQaHostView(qa: LiveQaState): LiveQaSnapshot {
  return view(qa, qa.questions.map(wire));
}

/**
 * What everyone sees: hidden questions are left out, and an anonymous
 * question carries no author.
 */
export function liveQaPublicView(qa: LiveQaState): LiveQaSnapshot {
  return view(
    qa,
    qa.questions
      .filter((question) => !question.hidden)
      .map((question) => {
        // Who voted stays with hosts; everyone else gets the count.
        const shared = { ...wire(question), upvotes: [] };
        if (!question.anonymous) return shared;
        const { authorName: _name, ...rest } = shared;
        return { ...rest, participantId: '' };
      })
  );
}

type Viewer = Pick<
  MeetRealtimeTokenPayload,
  'accountId' | 'guest' | 'role' | 'userId'
>;

function liveQaSelf(qa: LiveQaState, token: Viewer) {
  const actor = token.accountId ?? token.userId;
  return {
    actor,
    participantId: token.userId,
    ...(token.guest ? { guest: true } : {}),
    votedIds: qa.questions
      .filter((question) => question.upvotes.includes(actor))
      .map((question) => question.id),
  };
}

const isHost = (token: Pick<MeetRealtimeTokenPayload, 'role'>) =>
  token.role === 'host';

/** The views one connection receives in reply to its own request. */
export function liveQaReplies(
  qa: LiveQaState,
  token: Viewer,
  requestId?: string
): LiveQaServerMessage[] {
  return [
    {
      type: 'qa.snapshot',
      snapshot: liveQaPublicView(qa),
      self: liveQaSelf(qa, token),
      requestId,
    },
    ...(isHost(token)
      ? [{ type: 'qa.host' as const, snapshot: liveQaHostView(qa) }]
      : []),
  ];
}

/**
 * Delivery for a change: the shared view to the room, the full view to every
 * other admitted host, and both views back to the sender.
 */
export function liveQaDelivery(
  state: MeetRoomSnapshot,
  qa: LiveQaState,
  token: Viewer,
  requestId?: string
): Partial<Omit<MeetRoomOutcome, 'state'>> {
  // One message object for every host, so the room serializes it once.
  const hostMessage = {
    type: 'qa.host' as const,
    snapshot: liveQaHostView(qa),
  };
  return {
    broadcast: [{ type: 'qa.snapshot', snapshot: liveQaPublicView(qa) }],
    direct: Object.entries(state.presence)
      .filter(
        ([userId, person]) =>
          userId !== token.userId &&
          person.role === 'host' &&
          !state.waiting[userId]
      )
      .map(([userId]) => ({ userId, message: hostMessage })),
    reply: liveQaReplies(qa, token, requestId),
  };
}
