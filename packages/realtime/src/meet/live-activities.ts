import {
  LIVE_ACTIVITY_LIMITS,
  type LiveActivityCommand,
  liveActivityRequestIdSchema,
  MEET_LIVE_ASSESSMENT_ENABLED,
} from './live-activities-schema';
import { applyLiveActivityGame } from './live-activity-game';
import {
  LIVE_ACTIVITY_ACTIONS_PER_MINUTE,
  nextLiveActivityLimit,
  serializedMeetBytes,
} from './live-activity-rate';
import {
  type Activities,
  EMPTY_ACTIVITIES,
  hostView,
  mineView,
  publicView,
  settleActivities,
} from './live-activity-views';
import type { MeetRealtimeServerMessage } from './messages';
import { canMeetRealtimeRunActivities } from './permissions';
import type { MeetRoomCommand, MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';

export * from './live-activities-schema';
export {
  EMPTY_LIVE_ACTIVITIES_MINE,
  EMPTY_LIVE_ACTIVITIES_SNAPSHOT,
} from './live-activity-views';

/**
 * The same questions as a new attempt: new ids and no answers, so nothing
 * written for the last attempt can attach to this one.
 */
function newAttempt(
  assessment: Activities['assessment'],
  status: 'draft' | 'open'
): Activities['assessment'] {
  return {
    status,
    attempt: crypto.randomUUID(),
    released: false,
    sealed: false,
    items: assessment.items.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
    })),
    responses: [],
  };
}

function applyActivity(
  state: Activities,
  command: LiveActivityCommand,
  participantId: string,
  now: number
): Activities | string {
  const { assessment, flashcards, game, icebreaker } = state;
  // A manager command for another attempt than the one stored is stale.
  const otherAttempt =
    'attemptId' in command &&
    command.attemptId !== (assessment.attempt ?? null);
  switch (command.kind) {
    case 'assessment.set':
      if (assessment.status !== 'draft') return 'activity_assessment_not_draft';
      return {
        ...state,
        assessment: {
          ...EMPTY_ACTIVITIES.assessment,
          attempt: crypto.randomUUID(),
          items: command.items.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
          })),
        },
      };
    case 'assessment.status':
      if (otherAttempt) return 'activity_assessment_changed';
      if (command.status === assessment.status) return state;
      if (command.from !== assessment.status)
        return 'activity_assessment_changed';
      // Back to draft clears the answers: what comes next is a new attempt.
      if (command.status === 'draft')
        return { ...state, assessment: newAttempt(assessment, 'draft') };
      // A release ends its attempt for good. Opening it again would discard
      // its answers, which only the separate new-attempt command may do.
      if (command.status === 'open' && assessment.sealed)
        return 'activity_assessment_sealed';
      return {
        ...state,
        assessment: { ...assessment, status: command.status },
      };
    case 'assessment.restart':
      if (otherAttempt) return 'activity_assessment_changed';
      if (assessment.status !== 'closed')
        return 'activity_assessment_not_closed';
      return { ...state, assessment: newAttempt(assessment, 'open') };
    case 'assessment.release':
      if (otherAttempt) return 'activity_assessment_changed';
      if (command.released === assessment.released) return state;
      // Keys and grades leave the managers only once answers are final.
      if (command.released && assessment.status !== 'closed')
        return 'activity_assessment_not_closed';
      // Hiding the results again does not unseal the attempt.
      return {
        ...state,
        assessment: command.released
          ? { ...assessment, released: true, sealed: true }
          : { ...assessment, released: false },
      };
    case 'assessment.submit': {
      if (assessment.status !== 'open' || assessment.released)
        return 'activity_assessment_closed';
      const item = assessment.items.find(({ id }) => id === command.itemId);
      if (!item) return 'activity_item_not_found';
      if (
        item.kind === 'choice'
          ? command.choice === undefined ||
            command.choice >= (item.options?.length ?? 0)
          : command.answer === undefined
      )
        return 'activity_invalid_answer';
      const existing = assessment.responses.find(
        (response) =>
          response.itemId === command.itemId &&
          response.participantId === participantId
      );
      if (
        existing &&
        existing.answer === command.answer &&
        existing.choice === command.choice
      )
        return state;
      if (!existing) {
        const actors = new Set(
          assessment.responses.map(({ participantId }) => participantId)
        );
        if (
          !actors.has(participantId) &&
          actors.size >= LIVE_ACTIVITY_LIMITS.actors
        )
          return 'activity_full';
      }
      // A replaced answer is a new revision and starts without a grade.
      const response = {
        participantId,
        itemId: command.itemId,
        answer: command.answer,
        choice: command.choice,
        revision: existing ? (existing.revision ?? 0) + 1 : 0,
      };
      const responses = existing
        ? assessment.responses.map((entry) =>
            entry === existing ? response : entry
          )
        : [...assessment.responses, response];
      return { ...state, assessment: { ...assessment, responses } };
    }
    case 'assessment.grade': {
      if (otherAttempt) return 'activity_assessment_changed';
      // Grades attach to final answers: closed, and the revision the grader read.
      if (assessment.status !== 'closed')
        return 'activity_assessment_not_closed';
      const index = assessment.responses.findIndex(
        ({ itemId, participantId }) =>
          itemId === command.itemId && participantId === command.participantId
      );
      const existing = assessment.responses[index];
      if (!existing) return 'activity_response_not_found';
      if ((existing.revision ?? 0) !== command.revision)
        return 'activity_answer_changed';
      if (
        existing.score === command.score &&
        existing.feedback === command.feedback
      )
        return state;
      const responses = assessment.responses.slice();
      responses[index] = {
        ...existing,
        score: command.score,
        feedback: command.feedback,
      };
      return { ...state, assessment: { ...assessment, responses } };
    }
    case 'flashcards.set':
      return {
        ...state,
        flashcards: {
          ...EMPTY_ACTIVITIES.flashcards,
          cards: command.cards.map((card) => ({
            ...card,
            id: crypto.randomUUID(),
          })),
        },
      };
    case 'flashcards.show':
      if (!flashcards.cards[command.index]) return 'activity_item_not_found';
      // A reveal names its card, so it never flips one from a newer deck.
      if (flashcards.cards[command.index]?.id !== command.cardId)
        return 'activity_card_changed';
      if (
        command.index === flashcards.index &&
        command.flipped === flashcards.flipped
      )
        return state;
      return {
        ...state,
        flashcards: {
          ...flashcards,
          index: command.index,
          flipped: command.flipped,
        },
      };
    case 'flashcards.mark': {
      if (!flashcards.cards.some(({ id }) => id === command.cardId))
        return 'activity_item_not_found';
      const known = flashcards.progress[participantId] ?? [];
      if (command.known === known.includes(command.cardId)) return state;
      const progress = { ...flashcards.progress };
      const marked = command.known
        ? [...known, command.cardId]
        : known.filter((id) => id !== command.cardId);
      if (marked.length) progress[participantId] = marked;
      else delete progress[participantId];
      if (Object.keys(progress).length > LIVE_ACTIVITY_LIMITS.actors)
        return 'activity_full';
      return { ...state, flashcards: { ...flashcards, progress } };
    }
    case 'game.set':
    case 'game.start':
    case 'game.next':
    case 'game.reveal':
    case 'game.reset':
    case 'game.answer': {
      const next = applyLiveActivityGame(game, command, participantId, now);
      if (typeof next === 'string') return next;
      return game === next ? state : { ...state, game: next };
    }
    case 'icebreaker.prompt':
      // Every prompt gets its own id, even the same words asked again.
      return {
        ...state,
        icebreaker: {
          prompt: command.text,
          promptId: command.text === null ? null : crypto.randomUUID(),
          responses: [],
        },
      };
    case 'icebreaker.respond': {
      if (icebreaker.prompt === null) return 'activity_icebreaker_unavailable';
      // A reply written for an earlier prompt never lands under the next one.
      if (command.promptId !== icebreaker.promptId)
        return 'activity_icebreaker_prompt_changed';
      const index = icebreaker.responses.findIndex(
        (response) => response.participantId === participantId
      );
      const existing = icebreaker.responses[index];
      if (existing?.text === command.text) return state;
      if (
        !existing &&
        icebreaker.responses.length >= LIVE_ACTIVITY_LIMITS.actors
      )
        return 'activity_full';
      const responses = icebreaker.responses.slice();
      if (existing) responses[index] = { ...existing, text: command.text };
      else {
        responses.push({
          id: crypto.randomUUID(),
          participantId,
          text: command.text,
          hidden: false,
        });
      }
      return { ...state, icebreaker: { ...icebreaker, responses } };
    }
    case 'icebreaker.hide': {
      const index = icebreaker.responses.findIndex(
        ({ id }) => id === command.responseId
      );
      const existing = icebreaker.responses[index];
      if (!existing) return 'activity_response_not_found';
      if (existing.hidden === command.hidden) return state;
      const responses = icebreaker.responses.slice();
      responses[index] = { ...existing, hidden: command.hidden };
      return { ...state, icebreaker: { ...icebreaker, responses } };
    }
  }
}

function refreshActors(
  command: LiveActivityCommand,
  before: Activities,
  after: Activities
) {
  switch (command.kind) {
    case 'assessment.release':
    case 'assessment.restart':
    case 'assessment.status':
      // A release changes what respondents see of their own result, and a
      // reset or a new attempt takes their answers away.
      return command.kind === 'assessment.release' ||
        before.assessment.released !== after.assessment.released ||
        before.assessment.responses.length !== after.assessment.responses.length
        ? before.assessment.responses.map(({ participantId }) => participantId)
        : [];
    case 'assessment.grade':
      return after.assessment.released ? [command.participantId] : [];
    case 'flashcards.set':
      return Object.keys(before.flashcards.progress);
    case 'icebreaker.prompt':
      return before.icebreaker.responses.map(
        ({ participantId }) => participantId
      );
    case 'game.set':
    case 'game.next':
    case 'game.reset':
      return before.game.phase === 'idle'
        ? []
        : Object.keys(before.game.answers);
    default:
      return [];
  }
}

/** Which activities the room offers; see `MEET_LIVE_ASSESSMENT_ENABLED`. */
export type LiveActivityFeatures = { assessment: boolean };

export function applyLiveActivities(
  state: MeetRoomSnapshot,
  { message, token, now }: MeetRoomCommand,
  features: LiveActivityFeatures = { assessment: MEET_LIVE_ASSESSMENT_ENABLED }
) {
  if (message.type !== 'activity.read' && message.type !== 'activity.command')
    return null;
  const { requestId } = message;
  const participantId = token.userId;
  const timestamp = Date.parse(now);
  if (
    state.ended ||
    !state.presence[participantId] ||
    state.waiting[participantId] ||
    (state.budget && timestamp >= state.budget.expiresAt)
  )
    return denied(state, 'awaiting_admission', requestId);
  const manager = canMeetRealtimeRunActivities(token);
  const stored = state.liveActivities ?? EMPTY_ACTIVITIES;
  // A prompt stored before prompts had ids gets its own now. The id goes back
  // into the room with this very outcome, a read included, so it is issued
  // once and every later read agrees on it. Its replies stay.
  const named =
    stored.icebreaker.prompt !== null && !stored.icebreaker.promptId
      ? {
          ...stored,
          icebreaker: { ...stored.icebreaker, promptId: crypto.randomUUID() },
        }
      : stored;
  const room = named === stored ? state : { ...state, liveActivities: named };
  const current = settleActivities(named);
  // With the assessment switched off, nothing of it leaves the room.
  const shown = (activities: Activities) =>
    features.assessment
      ? activities
      : { ...activities, assessment: EMPTY_ACTIVITIES.assessment };
  if (message.type === 'activity.read') {
    const reply: MeetRealtimeServerMessage[] = [
      { type: 'activity.snapshot', snapshot: publicView(shown(current)), requestId },
      {
        type: 'activity.mine',
        mine: mineView(shown(current), participantId),
        requestId,
      },
    ];
    if (manager)
      reply.push({ type: 'activity.host', host: hostView(shown(current)), requestId });
    return outcome(room, { reply });
  }

  const { command } = message;
  if (!features.assessment && command.kind.startsWith('assessment.'))
    return denied(room, 'activity_assessment_disabled', requestId);
  if (
    !manager &&
    command.kind !== 'assessment.submit' &&
    command.kind !== 'flashcards.mark' &&
    command.kind !== 'game.answer' &&
    command.kind !== 'icebreaker.respond'
  )
    return denied(room, 'permission_denied', requestId);
  const limits = nextLiveActivityLimit(
    state.liveActivityLimits,
    token.accountId ?? participantId,
    timestamp,
    LIVE_ACTIVITY_ACTIONS_PER_MINUTE
  );
  if (!limits) return denied(room, 'activity_rate_limited', requestId);
  const next = applyActivity(current, command, participantId, timestamp);
  if (typeof next === 'string') return denied(room, next, requestId);
  const reply: MeetRealtimeServerMessage[] = [
    { type: 'activity.mine', mine: mineView(shown(next), participantId), requestId },
  ];
  if (next === current) return outcome(room, { reply });
  if (command.kind === 'flashcards.mark') {
    // A mark changes one person's progress and nothing the room shares. They
    // get their own view back and the managers a small update; no shared view
    // is sent again, so the cost does not grow with the room or the deck.
    if (serializedMeetBytes(next) > LIVE_ACTIVITY_LIMITS.stateBytes)
      return denied(room, 'activity_full', requestId);
    return outcome(
      { ...room, liveActivities: next, liveActivityLimits: limits },
      {
        reply,
        toManagers: [
          {
            type: 'activity.progress',
            flashcards: {
              participantId,
              known: next.flashcards.progress[participantId]?.length ?? 0,
            },
          },
        ],
      }
    );
  }

  const snapshot = publicView(shown(next));
  const host = hostView(shown(next));
  if (
    serializedMeetBytes(snapshot) > LIVE_ACTIVITY_LIMITS.viewBytes ||
    serializedMeetBytes(host) > LIVE_ACTIVITY_LIMITS.viewBytes ||
    serializedMeetBytes(next) > LIVE_ACTIVITY_LIMITS.stateBytes
  )
    return denied(room, 'activity_full', requestId);
  const direct: ReturnType<typeof outcome>['direct'] = [];
  for (const userId of new Set(refreshActors(command, current, next))) {
    if (
      userId !== participantId &&
      state.presence[userId] &&
      !state.waiting[userId]
    ) {
      direct.push({
        userId,
        message: { type: 'activity.mine', mine: mineView(shown(next), userId) },
      });
    }
  }
  return outcome(
    { ...room, liveActivities: next, liveActivityLimits: limits },
    {
      reply,
      broadcast: [{ type: 'activity.snapshot', snapshot }],
      toManagers: [{ type: 'activity.host', host }],
      direct,
    }
  );
}

/**
 * The reply to a frame the room could not read. An activity frame keeps its
 * request id when that id is valid, so the sender shows the refusal: a command
 * from a page older than the room fails visibly instead of silently.
 */
export function malformedMeetEventReply(
  json: unknown
): MeetRealtimeServerMessage {
  const frame =
    typeof json === 'object' && json !== null
      ? (json as { type?: unknown; requestId?: unknown })
      : {};
  const requestId =
    typeof frame.type === 'string' && frame.type.startsWith('activity.')
      ? liveActivityRequestIdSchema.safeParse(frame.requestId).data
      : undefined;
  return {
    type: 'error',
    error: 'malformed_event',
    ...(requestId ? { requestId } : {}),
  };
}
