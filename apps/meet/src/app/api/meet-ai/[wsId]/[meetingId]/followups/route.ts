import { connection } from 'next/server';
import {
  type MeetAiParams,
  meetAiResponse,
} from '@/features/meeting-ai/server/access';
import { readFollowupContext } from '@/features/meeting-ai/server/followup-context';
import { createFollowup } from '@/features/meeting-ai/server/followup-create';
export async function GET(request: Request, params: MeetAiParams) {
  await connection();
  return meetAiResponse(() => readFollowupContext(request, params));
}
export async function POST(request: Request, params: MeetAiParams) {
  return meetAiResponse(() => createFollowup(request, params));
}
