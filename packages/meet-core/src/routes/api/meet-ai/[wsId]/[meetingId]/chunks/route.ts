import {
  type MeetAiParams,
  meetAiResponse,
  MeetAiError,
} from '@tuturuuu/meet-core/features/meeting-ai/server/access';
export async function POST(_request: Request, _params: MeetAiParams) {
  return meetAiResponse(() => {
    throw new MeetAiError(
      403,
      'Audio transcription is unavailable. Private Mira hears only its requester.'
    );
  });
}
