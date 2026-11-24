import {
  type MeetAiParams,
  meetAiResponse,
} from '@tuturuuu/meet-core/features/meeting-ai/server/access';
import { openSelfStream } from '@tuturuuu/meet-core/features/meeting-ai/server/self-v1-stream';

export async function POST(request: Request, params: MeetAiParams) {
  return meetAiResponse(() => openSelfStream(request, params));
}
