import {
  LIVE_ACTIVITY_LIMITS,
  type LiveActivityCommand,
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

function applyActivity(
  state: Activities,
  command: LiveActivityCommand,
  participantId: string,
  now: number
): Activities | string {
  const { assessment, flashcards, game, icebreaker } = state;
  switch (command.kind) {
    case 'assessment.set':
      if (assessment.status !== 'draft') return 'activity_assessment_not_draft';
      return {
        ...state,
        assessment: {
          ...EMPTY_ACTIVITIES.assessment,
          items: command.items.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
          })),
        },
      };
    case 'assessment.status':
      if (command.status === assessment.status) return state;
      return {
        ...state,
        assessment:
          command.status === 'draft'
            ? { ...assessment, status: 'draft', responses: [], released: false }
            : command.status === 'open'
              ? // Answers can change again, so released results are withdrawn.
                { ...assessment, status: 'open', released: false }
              : { ...assessment, status: command.status },
      };
    case 'assessment.release':
      if (command.released === assessment.released) return state;
      // Keys and grades leave the managers only once answers are final.
      if (command.released && assessment.status !== 'closed')
        return 'activity_assessment_not_closed';
      return {
        ...state,
        assessment: { ...assessment, released: command.released },
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
    case 'assessment.status':
      // Reopening withdraws released results, so each respondent's own view
      // loses its score and feedback again.
      return command.kind === 'assessment.release' ||
        command.status === 'draft' ||
        before.assessment.released !== after.assessment.released
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

export function applyLiveActivities(
  state: MeetRoomSnapshot,
  { message, token, now }: MeetRoomCommand
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
  const current = state.liveActivities ?? EMPTY_ACTIVITIES;
  if (message.type === 'activity.read') {
    const reply: MeetRealtimeServerMessage[] = [
      { type: 'activity.snapshot', snapshot: publicView(current), requestId },
      {
        type: 'activity.mine',
        mine: mineView(current, participantId),
        requestId,
      },
    ];
    if (manager)
      reply.push({ type: 'activity.host', host: hostView(current), requestId });
    return outcome(state, { reply });
  }

  const { command } = message;
  if (
    !manager &&
    command.kind !== 'assessment.submit' &&
    command.kind !== 'flashcards.mark' &&
    command.kind !== 'game.answer' &&
    command.kind !== 'icebreaker.respond'
  )
    return denied(state, 'permission_denied', requestId);
  const limits = nextLiveActivityLimit(
    state.liveActivityLimits,
    token.accountId ?? participantId,
    timestamp,
    LIVE_ACTIVITY_ACTIONS_PER_MINUTE
  );
  if (!limits) return denied(state, 'activity_rate_limited', requestId);
  const next = applyActivity(current, command, participantId, timestamp);
  if (typeof next === 'string') return denied(state, next, requestId);
  const reply: MeetRealtimeServerMessage[] = [
    { type: 'activity.mine', mine: mineView(next, participantId), requestId },
  ];
  if (next === current) return outcome(state, { reply });

  const snapshot = publicView(next);
  const host = hostView(next);
  if (
    serializedMeetBytes(snapshot) > LIVE_ACTIVITY_LIMITS.viewBytes ||
    serializedMeetBytes(host) > LIVE_ACTIVITY_LIMITS.viewBytes ||
    serializedMeetBytes(next) > LIVE_ACTIVITY_LIMITS.stateBytes
  )
    return denied(state, 'activity_full', requestId);
  const direct: ReturnType<typeof outcome>['direct'] = [];
  for (const userId of new Set(refreshActors(command, current, next))) {
    if (
      userId !== participantId &&
      state.presence[userId] &&
      !state.waiting[userId]
    ) {
      direct.push({
        userId,
        message: { type: 'activity.mine', mine: mineView(next, userId) },
      });
    }
  }
  return outcome(
    { ...state, liveActivities: next, liveActivityLimits: limits },
    {
      reply,
      broadcast: [{ type: 'activity.snapshot', snapshot }],
      toManagers: [{ type: 'activity.host', host }],
      direct,
    }
  );
}
