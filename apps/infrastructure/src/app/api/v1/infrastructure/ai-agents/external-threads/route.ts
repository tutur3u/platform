import { type NextRequest, NextResponse } from 'next/server';
import { listAiAgentExternalThreads } from '@/lib/ai-agents/external-chat-mirror';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../access';

async function listThreads(request: NextRequest) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const url = new URL(request.url);

  try {
    const threads = await listAiAgentExternalThreads({
      agentId: url.searchParams.get('agentId'),
      channelId: url.searchParams.get('channelId'),
      wsId: url.searchParams.get('wsId'),
    });

    return NextResponse.json({ threads });
  } catch (error) {
    serverLogger.error('Failed to list AI agent external threads', error);
    return NextResponse.json(
      { error: 'Failed to list external threads' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/ai-agents/external-threads',
    },
    () => listThreads(request)
  );
}
