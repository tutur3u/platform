import { authenticateAiStudioRequest } from '@tuturuuu/ai/studio/auth';
import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { getAiStudioRequestId } from '@tuturuuu/ai/studio/request';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { z } from 'zod';
import { publicApiError } from '@/lib/public-api';
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
    ]),
    scenarioId: z.string().min(1).max(128),
    jobId: z.uuid(),
    sequence: z.number().int().min(1).max(50),
  })
  .strict();

/** Only an unbound root workspace key may fund Colab sponsorships. */
export async function POST(request: Request) {
  const requestId = getAiStudioRequestId(request);
  try {
    const credential = await authenticateAiStudioRequest(request);
    if (
      credential.workspaceId !== ROOT_WORKSPACE_ID ||
      credential.apiKey.external_app_id
    ) {
      throw new AiStudioError(
        'Colab sponsorship requires an unbound root-workspace AI key.',
        { code: 'invalid_api_key', status: 403, type: 'authentication_error' }
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = sponsorshipSchema.safeParse(body?.sponsorship);
    if (!parsed.success)
      throw new AiStudioError(
        'A complete workshop sponsorship description is required.',
        { code: 'invalid_request_error', status: 400 }
      );
    const sponsor = parsed.data;
    // These are trusted credential identity and server policy, never caller-selected billing fields.
    const metadata = {
      ...sponsor,
      sponsor: 'Tuturuuu',
      sponsor_workspace_id: ROOT_WORKSPACE_ID,
      product: 'colab',
      description: `Tuturuuu sponsors ${sponsor.operation} / ${sponsor.phase} for workshop "${sponsor.workshopTitle}", team "${sponsor.teamName}" (step ${sponsor.sequence}). Attendee personal credits are not charged.`,
    };
    const response = await executeTextRequest(
      request,
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
        credential: { ...credential, kind: 'api-key' },
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
