import { getAiStudioRequestId } from '@tuturuuu/ai/studio/request';
import { connection } from 'next/server';
import {
  authenticatePublicAiRequest,
  listAllowedModels,
  publicApiError,
} from '@/lib/public-api';

export async function GET(request: Request) {
  await connection();
  const requestId = getAiStudioRequestId(request);

  try {
    const credential = await authenticatePublicAiRequest(request);
    const models = await listAllowedModels(credential);

    return Response.json(
      {
        data: models.map((model) => ({
          created: 0,
          id: model.id,
          object: 'model',
          owned_by: model.provider,
          tuturuuu: {
            context_window: model.context_window,
            max_output_tokens: model.max_tokens,
            name: model.name,
            tags: model.tags,
            type: model.type,
          },
        })),
        object: 'list',
      },
      { headers: { 'x-request-id': requestId } }
    );
  } catch (error) {
    return publicApiError(error, requestId);
  }
}
