import { meetAiResponse } from '@tuturuuu/meet-core/features/meeting-ai/server/access';
import { finalizeMeetAi } from '@tuturuuu/meet-core/features/meeting-ai/server/finalize';

export async function POST(request: Request) {
  return meetAiResponse(() => finalizeMeetAi(request));
}
