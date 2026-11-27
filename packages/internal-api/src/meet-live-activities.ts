import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type MeetLiveActivityDraftKind =
  | 'flashcards'
  | 'game'
  | 'icebreaker'
  | 'assessment';

export type MeetLiveActivityDraftDifficulty =
  | 'beginner'
  | 'intermediate'
  | 'advanced';

export interface MeetLiveActivityDraftInput {
  kind: MeetLiveActivityDraftKind;
  prompt: string;
  count?: number;
  locale?: 'en' | 'vi';
  difficulty?: MeetLiveActivityDraftDifficulty;
}

export type MeetLiveActivityDraftResult =
  | {
      kind: 'flashcards';
      title: string;
      cards: Array<{ front: string; back: string }>;
    }
  | {
      kind: 'game';
      rounds: Array<{
        prompt: string;
        options: string[];
        answer: number;
        seconds: number;
      }>;
    }
  | {
      kind: 'icebreaker';
      prompt: string;
      starters: string[];
    }
  | {
      kind: 'assessment';
      title: string;
      items: Array<{
        prompt: string;
        kind: 'short' | 'long' | 'choice';
        options: string[];
        answer?: number;
      }>;
    };

export function draftMeetLiveActivity(
  meetingId: string,
  input: MeetLiveActivityDraftInput,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MeetLiveActivityDraftResult>(
    `/api/meet-call/${encodePathSegment(meetingId)}/live-activities/mira-draft`,
    {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
