import {
  type MeetAiParams,
  meetAiResponse,
} from '@tuturuuu/meet-core/features/meeting-ai/server/access';
import { meetTranscriptAiConsent } from '../../../../../../features/meeting-ai/server/ai-data-consent';
import { transcribeMeetChunk } from '@tuturuuu/meet-core/features/meeting-ai/server/chunks';

export async function POST(request: Request, params: MeetAiParams) {
  return meetAiResponse(() =>
    transcribeMeetChunk(request, params, meetTranscriptAiConsent(request))
  );
}
