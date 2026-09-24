import {
  type MeetAiParams,
  meetAiResponse,
} from '@tuturuuu/meet-core/features/meeting-ai/server/access';
import { readFollowupContext } from '@tuturuuu/meet-core/features/meeting-ai/server/followup-context';
import { createFollowup } from '@tuturuuu/meet-core/features/meeting-ai/server/followup-create';
import { connection } from 'next/server';
export async function GET(request: Request, params: MeetAiParams) {
  await connection();
  return meetAiResponse(() => readFollowupContext(request, params));
}
export async function POST(request: Request, params: MeetAiParams) {
  return meetAiResponse(() => createFollowup(request, params));
}
