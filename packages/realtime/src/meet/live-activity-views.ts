import type { ActorLimitBuckets } from './actor-rate-limit';
import type {
  LiveActivityCommand,
  LiveActivitiesHost,
  LiveActivitiesMine,
  LiveActivitiesSnapshot,
} from './live-activities-schema';
import {
  EMPTY_ACTIVITY_GAME,
  type LiveActivityGame,
  liveGameSnapshot,
} from './live-activity-game';

type AssessmentItem = Extract<
  LiveActivityCommand,
  { kind: 'assessment.set' }
>['items'][number] & {
  id: string;
};
type AssessmentResponse = LiveActivitiesHost['assessment']['responses'][number];
type IcebreakerResponse = LiveActivitiesHost['icebreaker']['hidden'][number] & {
  hidden: boolean;
};
export type Activities = {
  assessment: Pick<
    LiveActivitiesSnapshot['assessment'],
    'status' | 'released'
  > & {
    items: AssessmentItem[];
    responses: AssessmentResponse[];
  };
  flashcards: LiveActivitiesSnapshot['flashcards'] & {
    progress: Record<string, string[]>;
  };
  game: LiveActivityGame;
  icebreaker: { prompt: string | null; responses: IcebreakerResponse[] };
};

declare module './room' {
  interface MeetRoomSnapshot {
    liveActivities?: Activities;
    liveActivityLimits?: ActorLimitBuckets;
  }
}

export const EMPTY_ACTIVITIES: Activities = {
  assessment: { status: 'draft', released: false, items: [], responses: [] },
  flashcards: { cards: [], index: 0, flipped: false, progress: {} },
  game: EMPTY_ACTIVITY_GAME,
  icebreaker: { prompt: null, responses: [] },
};

export const EMPTY_LIVE_ACTIVITIES_SNAPSHOT = publicView(EMPTY_ACTIVITIES);
export const EMPTY_LIVE_ACTIVITIES_MINE = mineView(EMPTY_ACTIVITIES, '');

export function publicView({
  assessment,
  flashcards,
  game,
  icebreaker,
}: Activities): LiveActivitiesSnapshot {
  const counts = Object.fromEntries(assessment.items.map(({ id }) => [id, 0]));
  for (const { itemId } of assessment.responses)
    counts[itemId] = (counts[itemId] ?? 0) + 1;
  return {
    assessment: {
      status: assessment.status,
      released: assessment.released,
      items: assessment.items.map(({ id, prompt, kind, options, answer }) => ({
        id,
        prompt,
        kind,
        options,
        ...(assessment.released && answer !== undefined
          ? { correct: answer }
          : {}),
      })),
      counts,
    },
    flashcards: {
      cards: flashcards.cards,
      index: flashcards.index,
      flipped: flashcards.flipped,
    },
    game: liveGameSnapshot(game),
    icebreaker: {
      prompt: icebreaker.prompt,
      responses: icebreaker.responses
        .filter(({ hidden }) => !hidden)
        .map(({ id, participantId, text }) => ({ id, participantId, text })),
    },
  };
}

export function mineView(
  { assessment, flashcards, game, icebreaker }: Activities,
  actor: string
): LiveActivitiesMine {
  const choice = game.phase === 'idle' ? undefined : game.answers[actor];
  return {
    assessment: Object.fromEntries(
      assessment.responses
        .filter(({ participantId }) => participantId === actor)
        .map(({ itemId, answer, choice, score, feedback }) => [
          itemId,
          {
            answer,
            choice,
            ...(assessment.released ? { score, feedback } : {}),
          },
        ])
    ),
    flashcards: { known: flashcards.progress[actor] ?? [] },
    game:
      game.phase === 'idle' || choice === undefined
        ? {}
        : {
            roundId: game.rounds[game.index]?.id,
            choice,
          },
    icebreaker: {
      text: icebreaker.responses.find(
        ({ participantId }) => participantId === actor
      )?.text,
    },
  };
}

export function hostView({
  assessment,
  flashcards,
  game,
  icebreaker,
}: Activities): LiveActivitiesHost {
  return {
    assessment: {
      responses: assessment.responses,
      answers: Object.fromEntries(
        assessment.items.flatMap(({ id, answer }) =>
          answer === undefined ? [] : [[id, answer]]
        )
      ),
    },
    game: {
      rounds: game.rounds.map(({ id, prompt, options, answer, seconds }) => ({
        id,
        prompt,
        options,
        answer,
        seconds,
      })),
    },
    flashcards: {
      progress: Object.entries(flashcards.progress).map(
        ([participantId, known]) => ({
          participantId,
          known: known.length,
        })
      ),
    },
    icebreaker: {
      hidden: icebreaker.responses
        .filter(({ hidden }) => hidden)
        .map(({ id, participantId, text }) => ({ id, participantId, text })),
    },
  };
}
