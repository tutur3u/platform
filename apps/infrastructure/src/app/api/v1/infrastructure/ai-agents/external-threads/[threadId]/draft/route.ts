import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { draftAiAgentExternalResponse } from '@/lib/ai-agents/external-chat-actions';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../../../access';

type RouteParams = {
  threadId: string;
};

const draftSchema = z.object({
  prompt: z.string().trim().max(4000).default(''),
});

async function draftResponse(request: NextRequest, params: RouteParams) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = draftSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid draft prompt' },
      { status: 400 }
    );
  }

  try {
    const result = await draftAiAgentExternalResponse({
      actorUserId: access.user.id,
      customPrompt: parsed.data.prompt,
      origin: request.nextUrl.origin,
      threadId: params.threadId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to draft AI agent external response', error);
    return NextResponse.json(
      { error: 'Failed to draft external response' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const resolvedParams = await params;

  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/infrastructure/ai-agents/external-threads/[threadId]/draft',
    },
    () => draftResponse(request, resolvedParams)
  );
}
