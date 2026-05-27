import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAiAgentById } from '@/lib/ai-agents/registry';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../../access';

interface Params {
  params: Promise<{
    agentId: string;
  }>;
}

const testSchema = z.object({
  channelId: z.string().trim().min(1).max(80),
  prompt: z.string().trim().max(1000).optional(),
});

async function testAgentChannel(request: NextRequest, { params }: Params) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { agentId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = testSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid AI agent test payload' },
      { status: 400 }
    );
  }

  try {
    const agent = await getAiAgentById({
      agentId,
      db: access.sbAdmin,
      origin: request.nextUrl.origin,
    });
    const channel = agent?.channels.find(
      (candidate) => candidate.id === parsed.data.channelId
    );

    if (!agent || !channel) {
      return NextResponse.json(
        { error: 'AI agent channel not found' },
        { status: 404 }
      );
    }

    const missing = channel.secrets
      .filter((secret) => !secret.configured)
      .map((secret) => secret.name);

    return NextResponse.json({
      ok: missing.length === 0 && agent.enabled && channel.enabled,
      response:
        missing.length > 0
          ? `Missing channel secrets: ${missing.join(', ')}`
          : `Agent "${agent.name}" is ready for ${channel.adapter} webhook traffic.`,
    });
  } catch (error) {
    serverLogger.warn('Failed to test AI agent channel', {
      agentId,
      channelId: parsed.data.channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to test AI agent channel' },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/ai-agents/[agentId]/test',
    },
    () => testAgentChannel(request, context)
  );
}
