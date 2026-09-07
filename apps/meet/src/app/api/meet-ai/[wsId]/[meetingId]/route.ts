import { connection } from 'next/server';
import {
  type MeetAiParams,
  meetAiResponse,
} from '@/features/meeting-ai/server/access';
import {
  changeMeetAi,
  readMeetAi,
} from '@/features/meeting-ai/server/sessions';

export async function GET(request: Request, params: MeetAiParams) {
  await connection();
  return meetAiResponse(() => readMeetAi(request, params));
}
export async function POST(request: Request, params: MeetAiParams) {
  return meetAiResponse(() => changeMeetAi(request, params));
}
