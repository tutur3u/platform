import {
  type MeetAiParams,
  meetAiResponse,
} from '@tuturuuu/meet-core/features/meeting-ai/server/access';
import {
  changeMeetAi,
  readMeetAi,
} from '@tuturuuu/meet-core/features/meeting-ai/server/sessions';
import { connection } from 'next/server';

export async function GET(request: Request, params: MeetAiParams) {
  await connection();
  return meetAiResponse(() => readMeetAi(request, params));
}
export async function POST(request: Request, params: MeetAiParams) {
  return meetAiResponse(() => changeMeetAi(request, params));
}
