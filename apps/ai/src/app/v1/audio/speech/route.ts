import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { publicApiError } from '@/lib/public-api';
import {
  executeSpeechRequest,
  speechRequestSchema,
} from '@/lib/speech-execution';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = speechRequestSchema.safeParse(body);
  if (!parsed.success) {
    return publicApiError(
      new AiStudioError(
        parsed.error.issues[0]?.message ?? 'Invalid speech request.',
        {
          code: 'invalid_request_error',
          status: 400,
        }
      )
    );
  }

  return executeSpeechRequest(request, parsed.data);
}
