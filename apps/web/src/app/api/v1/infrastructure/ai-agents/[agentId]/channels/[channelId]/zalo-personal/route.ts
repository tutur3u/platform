import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAiAgentZaloPersonalStatus,
  startAiAgentZaloPersonalListener,
  stopAiAgentZaloPersonalListener,
  validateAiAgentZaloPersonalChannel,
} from '@/lib/ai-agents/zalo-personal-listeners';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../../../../access';

interface Params {
  params: Promise<{
    agentId: string;
    channelId: string;
  }>;
}

const actionSchema = z.object({
  action: z.enum(['start', 'stop', 'validate']),
});

async function getStatus(request: NextRequest, { params }: Params) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { agentId, channelId } = await params;

  try {
    const status = await getAiAgentZaloPersonalStatus({
      agentId,
      channelId,
      db: access.sbAdmin,
      origin: request.nextUrl.origin,
    });

    return NextResponse.json({ status });
  } catch (error) {
    serverLogger.warn('Failed to get personal Zalo AI agent status', {
      agentId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to get personal Zalo AI agent status' },
      { status: 400 }
    );
  }
}

async function runAction(request: NextRequest, { params }: Params) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { agentId, channelId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid personal Zalo action payload' },
      { status: 400 }
    );
  }

  try {
    const input = {
      agentId,
      channelId,
      db: access.sbAdmin,
      origin: request.nextUrl.origin,
    };
    const status =
      parsed.data.action === 'validate'
        ? await validateAiAgentZaloPersonalChannel(input)
        : parsed.data.action === 'start'
          ? await startAiAgentZaloPersonalListener(input)
          : await stopAiAgentZaloPersonalListener(input);

    return NextResponse.json({ status });
  } catch (error) {
    serverLogger.warn('Failed to run personal Zalo AI agent action', {
      action: parsed.data.action,
      agentId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to run personal Zalo AI agent action' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/infrastructure/ai-agents/[agentId]/channels/[channelId]/zalo-personal',
    },
    () => getStatus(request, context)
  );
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/infrastructure/ai-agents/[agentId]/channels/[channelId]/zalo-personal',
    },
    () => runAction(request, context)
  );
}
