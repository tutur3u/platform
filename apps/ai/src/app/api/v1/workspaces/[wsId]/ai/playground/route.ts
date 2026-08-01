import type { AiStudioCredential } from '@tuturuuu/ai/studio/auth';
import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { getAiStudioRequestId } from '@tuturuuu/ai/studio/request';
import { connection } from 'next/server';
import { z } from 'zod';
import { listAllowedModels, publicApiError } from '@/lib/public-api';
import { authorizeAiStudioWorkspaceRequest } from '@/lib/session-api';
import { executeTextRequest, parseTextRequest } from '@/lib/text-execution';

const playgroundSchema = z.object({
  endpoint: z.enum(['chat', 'responses']),
  instructions: z.string().max(100_000).optional(),
  keyId: z.string().uuid(),
  maxOutputTokens: z.number().int().min(1).max(32_768),
  maxSteps: z.number().int().min(1).max(8),
  model: z.string().min(1),
  prompt: z.string().min(1).max(1_000_000),
  tools: z.array(z.enum(['calculator', 'current_time'])).max(2),
});

type AuthorizedRequest = Awaited<
  ReturnType<typeof authorizeAiStudioWorkspaceRequest>
>;
type Authorized = Extract<AuthorizedRequest, { ok: true }>;

async function savedKeyCredential(auth: Authorized, keyId: string) {
  const { data: apiKey, error } = await auth.sbAdmin
    .schema('private')
    .from('ai_studio_api_keys')
    .select('*')
    .eq('id', keyId)
    .eq('ws_id', auth.workspace.id)
    .maybeSingle();

  if (error) {
    throw new AiStudioError('The saved API key could not be loaded.', {
      code: 'server_error',
      status: 500,
      type: 'server_error',
    });
  }

  const expired =
    apiKey?.expires_at && new Date(apiKey.expires_at).getTime() <= Date.now();
  if (!apiKey || apiKey.revoked_at || expired) {
    throw new AiStudioError(
      'The selected saved API key is no longer active. Choose another key or manage your API keys.',
      {
        code: 'invalid_api_key',
        status: 401,
        type: 'authentication_error',
      }
    );
  }

  return {
    apiKey,
    actorId: auth.user.id,
    kind: 'api-key',
    workspaceId: auth.workspace.id,
  } satisfies AiStudioCredential & { kind: 'api-key' };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const requestId = getAiStudioRequestId(request);

  try {
    const { wsId } = await params;
    const auth = await authorizeAiStudioWorkspaceRequest(
      wsId,
      'manage_ai_keys'
    );
    if (!auth.ok) return auth.response;

    const keyId = new URL(request.url).searchParams.get('keyId');
    if (!keyId || !z.string().uuid().safeParse(keyId).success) {
      throw new AiStudioError('Choose a valid saved API key.', {
        code: 'invalid_request_error',
        status: 400,
      });
    }

    const credential = await savedKeyCredential(auth, keyId);
    const models = await listAllowedModels(credential);
    return Response.json(
      {
        data: models.map((model) => ({
          contextWindow: model.context_window,
          id: model.id,
          maxOutputTokens: model.max_tokens,
          name: model.name,
          ownedBy: model.provider,
          type: model.type,
        })),
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'x-request-id': requestId,
        },
      }
    );
  } catch (error) {
    return publicApiError(error, requestId);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const requestId = getAiStudioRequestId(request);

  try {
    const { wsId } = await params;
    const auth = await authorizeAiStudioWorkspaceRequest(
      wsId,
      'manage_ai_keys'
    );
    if (!auth.ok) return auth.response;

    const body = playgroundSchema.parse(await request.json());
    const credential = await savedKeyCredential(auth, body.keyId);
    return executeTextRequest(
      request,
      parseTextRequest({
        instructions: body.instructions,
        max_output_tokens: body.maxOutputTokens,
        max_steps: body.maxSteps,
        model: body.model,
        prompt: body.prompt,
        tools: body.tools,
      }),
      {
        credential,
        feature: body.endpoint === 'chat' ? 'chat_completions' : 'responses',
        responseShape: body.endpoint,
      }
    );
  } catch (error) {
    return publicApiError(
      error instanceof SyntaxError
        ? new AiStudioError('Request body must be valid JSON.', {
            code: 'invalid_request_error',
            status: 400,
          })
        : error instanceof z.ZodError
          ? new AiStudioError(
              error.issues[0]?.message ?? 'Invalid playground request.',
              { code: 'invalid_request_error', status: 400 }
            )
          : error,
      requestId
    );
  }
}
