import { authenticateAiStudioRequest } from '@tuturuuu/ai/studio/auth';
import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { getAiStudioRequestId } from '@tuturuuu/ai/studio/request';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { z } from 'zod';
import { authenticateColabGrant } from '@/lib/colab-first-party';
import { executeImageRequest, imageRequestSchema } from '@/lib/image-execution';
import { listAllowedModels, publicApiError } from '@/lib/public-api';
import { executeTextRequest, parseTextRequest } from '@/lib/text-execution';

const sponsorshipSchema = z
  .object({
    workshopId: z.string().min(1).max(128),
    workshopTitle: z.string().min(1).max(150),
    hostId: z.string().min(1).max(128),
    teamId: z.string().min(1).max(128),
    teamName: z.string().min(1).max(150),
    participantId: z.string().min(1).max(128),
    operation: z.enum(['compile', 'analyze', 'run', 'scenario']),
    phase: z.enum([
      'generation',
      'prompt_review',
      'agent_step',
      'result_coaching',
      'image_generation',
    ]),
    scenarioId: z.string().min(1).max(128),
    jobId: z.uuid(),
    sequence: z.number().int().min(1).max(256),
  })
  .strict();

/** Canonical one-use room approvals (or legacy root keys) fund sponsored work. */
export async function POST(request: Request) {
  const requestId = getAiStudioRequestId(request);
  try {
    const raw = await request.text();
    if (raw.length > 250_000)
      throw new AiStudioError('Request too large.', {
        code: 'invalid_request_error',
        status: 413,
      });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const parsed = sponsorshipSchema.safeParse(body?.sponsorship);
    if (!parsed.success)
      throw new AiStudioError(
        'A complete workshop sponsorship description is required.',
        { code: 'invalid_request_error', status: 400 }
      );
    const credential = request.headers.has('x-colab-grant')
      ? await authenticateColabGrant(request, raw, parsed.data)
      : {
          ...(await authenticateAiStudioRequest(request)),
          kind: 'api-key' as const,
        };
    if (
      credential.workspaceId !== ROOT_WORKSPACE_ID ||
      (credential.kind === 'api-key' && credential.apiKey.external_app_id)
    ) {
      throw new AiStudioError(
        'Colab sponsorship requires an unbound root-workspace AI key.',
        { code: 'invalid_api_key', status: 403, type: 'authentication_error' }
      );
    }
    const sponsor = parsed.data;
    const headers = new Headers(request.headers);
    headers.set(
      'idempotency-key',
      `colab:${sponsor.jobId}:${sponsor.sequence}`
    );
    headers.set('x-request-id', `colab:${sponsor.jobId}:${sponsor.sequence}`);
    headers.delete('x-tuturuuu-operation');
    headers.delete('x-tuturuuu-entity-id');
    const executionRequest = new Request(request.url, {
      method: 'POST',
      headers,
      signal: request.signal,
    });
    // These are trusted credential identity and server policy, never caller-selected billing fields.
    const metadata = {
      ...sponsor,
      sponsor: 'Tuturuuu',
      sponsor_workspace_id: ROOT_WORKSPACE_ID,
      product: 'colab',
      description: `Tuturuuu sponsors ${sponsor.operation} / ${sponsor.phase} for workshop "${sponsor.workshopTitle}", team "${sponsor.teamName}" (step ${sponsor.sequence}). Attendee personal credits are not charged.`,
    };
    let response: Response;
    if (sponsor.phase === 'image_generation') {
      if (sponsor.operation !== 'run')
        throw new AiStudioError(
          'Images are available inside agent runs only.',
          { code: 'invalid_request_error', status: 400 }
        );
      const models = (await listAllowedModels(credential)).filter(
        (model) => model.type === 'image'
      );
      const model =
        models.find(
          (model) => model.id === 'google/imagen-4.0-fast-generate-001'
        ) ?? models[0];
      if (!model)
        throw new AiStudioError(
          'A priced image model must be enabled in the sponsor workspace.',
          { code: 'model_not_found', status: 503 }
        );
      response = await executeImageRequest(
        executionRequest,
        imageRequestSchema.parse({
          model: model.id,
          prompt: body.prompt,
          n: 1,
        }),
        {
          credential,
          metadata,
          feature: 'colab_run_image',
          requirePricedUsage: true,
        }
      );
    } else
      response = await executeTextRequest(
        executionRequest,
        parseTextRequest({
          instructions: body.instructions,
          prompt: body.prompt,
          model: body.model,
          max_output_tokens: 4096,
          max_steps: 1,
          response_format: { type: 'json_object' },
          stream: false,
          tools: [],
        }),
        {
          credential,
          feature: `colab_${sponsor.operation}`,
          responseShape: 'chat',
          metadata,
          requirePricedUsage: true,
        }
      );
    if (response.ok)
      response.headers.set('x-colab-sponsor-workspace', ROOT_WORKSPACE_ID);
    return response;
  } catch (error) {
    return publicApiError(
      error instanceof SyntaxError
        ? new AiStudioError('Request body must be valid JSON.', {
            code: 'invalid_request_error',
            status: 400,
          })
        : error,
      requestId
    );
  }
}
