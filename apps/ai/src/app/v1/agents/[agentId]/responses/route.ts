import { authenticateAiStudioRequest } from '@tuturuuu/ai/studio/auth';
import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection } from 'next/server';
import { z } from 'zod';
import { publicApiError } from '@/lib/public-api';
import { executeTextRequest, textRequestSchema } from '@/lib/text-execution';

const agentInputSchema = textRequestSchema.omit({
  instructions: true,
  model: true,
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  await connection();

  try {
    const [{ agentId }, credential, body] = await Promise.all([
      params,
      authenticateAiStudioRequest(request),
      request.json(),
    ]);
    const input = agentInputSchema.parse(body);
    const sbAdmin = await createAdminClient({ noCookie: true });
    const { data: agent } = await sbAdmin
      .schema('private')
      .from('ai_studio_agents')
      .select('id, latest_version')
      .eq('id', agentId)
      .eq('ws_id', credential.workspaceId)
      .is('archived_at', null)
      .maybeSingle();

    if (!agent || agent.latest_version < 1) {
      throw new AiStudioError('The requested agent was not found.', {
        code: 'invalid_request_error',
        status: 404,
      });
    }

    const { data: version } = await sbAdmin
      .schema('private')
      .from('ai_studio_agent_versions')
      .select('instructions, model_id')
      .eq('agent_id', agent.id)
      .eq('version', agent.latest_version)
      .maybeSingle();

    if (!version) {
      throw new AiStudioError('The requested agent version was not found.', {
        code: 'invalid_request_error',
        status: 404,
      });
    }

    return executeTextRequest(
      request,
      {
        ...input,
        instructions: version.instructions,
        model: version.model_id,
      },
      { feature: `agent:${agent.id}`, responseShape: 'responses' }
    );
  } catch (error) {
    return publicApiError(
      error instanceof z.ZodError
        ? new AiStudioError(error.issues[0]?.message ?? 'Invalid request.', {
            code: 'invalid_request_error',
            status: 400,
          })
        : error
    );
  }
}
