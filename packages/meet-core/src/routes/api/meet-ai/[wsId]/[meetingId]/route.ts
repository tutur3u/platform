import {
  type MeetAiParams,
  meetAiResponse,
  MeetAiError,
} from '@tuturuuu/meet-core/features/meeting-ai/server/access';
import { readMeetAi } from '@tuturuuu/meet-core/features/meeting-ai/server/sessions';
import { connection } from 'next/server';

export async function GET(request: Request, params: MeetAiParams) {
  await connection();
  return meetAiResponse(() => readMeetAi(request, params));
}
export async function POST(_request: Request, _params: MeetAiParams) {
  return meetAiResponse(() => {
    throw new MeetAiError(
      403,
      'Meeting transcription and notes are unavailable. Use Private Mira.'
    );
  });
}
