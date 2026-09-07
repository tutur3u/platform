import {
  type MeetAiParams,
  meetAiResponse,
} from '@/features/meeting-ai/server/access';
import { transcribeMeetChunk } from '@/features/meeting-ai/server/chunks';

export async function POST(request: Request, params: MeetAiParams) {
  return meetAiResponse(() => transcribeMeetChunk(request, params));
}
