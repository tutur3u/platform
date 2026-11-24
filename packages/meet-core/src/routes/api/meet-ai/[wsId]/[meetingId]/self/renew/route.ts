import {
  type MeetAiParams,
  meetAiResponse,
} from '@tuturuuu/meet-core/features/meeting-ai/server/access';
import { renewSelfStream } from '@tuturuuu/meet-core/features/meeting-ai/server/self-v1-stream';

export async function POST(request: Request, params: MeetAiParams) {
  return meetAiResponse(() => renewSelfStream(request, params));
}
