import {
  type MeetAiParams,
  meetAiResponse,
} from '@tuturuuu/meet-core/features/meeting-ai/server/access';
import { setSelfMode } from '@tuturuuu/meet-core/features/meeting-ai/server/self-v1-controls';

export async function POST(request: Request, params: MeetAiParams) {
  return meetAiResponse(() => setSelfMode(request, params));
}
