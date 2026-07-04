import { type NextRequest, NextResponse } from 'next/server';
import { listAiAgentExternalThreadMessages } from '@/lib/ai-agents/external-chat-mirror';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../../../access';

type RouteParams = {
  threadId: string;
};

async function listMessages(request: NextRequest, params: RouteParams) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get('limit') ?? 80);

  try {
    const messages = await listAiAgentExternalThreadMessages({
      limit: Number.isFinite(limit) ? limit : 80,
      threadId: params.threadId,
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Failed to list AI agent external messages', error);
    return NextResponse.json(
      { error: 'Failed to list external messages' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const resolvedParams = await params;

  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/infrastructure/ai-agents/external-threads/[threadId]/messages',
    },
    () => listMessages(request, resolvedParams)
  );
}
