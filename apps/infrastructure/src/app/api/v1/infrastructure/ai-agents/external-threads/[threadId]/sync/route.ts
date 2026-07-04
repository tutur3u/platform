import { type NextRequest, NextResponse } from 'next/server';
import { syncAiAgentExternalThread } from '@/lib/ai-agents/external-chat-actions';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../../../access';

type RouteParams = {
  threadId: string;
};

async function syncThread(request: NextRequest, params: RouteParams) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  try {
    const result = await syncAiAgentExternalThread({
      origin: request.nextUrl.origin,
      threadId: params.threadId,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error('Failed to sync AI agent external thread', error);
    return NextResponse.json(
      { message: 'Failed to sync external thread', ok: false, synced: 0 },
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
        '/api/v1/infrastructure/ai-agents/external-threads/[threadId]/sync',
    },
    () => syncThread(request, resolvedParams)
  );
}
