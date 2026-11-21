import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pauseAiAgentChannel } from '@/lib/ai-agents/registry';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../../access';

interface Params {
  params: Promise<{
    agentId: string;
  }>;
}

const pauseSchema = z.object({
  channelId: z.string().trim().min(1).max(80),
});

async function pauseAgentChannel(request: NextRequest, { params }: Params) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { agentId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = pauseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid AI agent pause payload' },
      { status: 400 }
    );
  }

  try {
    const agent = await pauseAiAgentChannel({
      agentId,
      channelId: parsed.data.channelId,
      db: access.sbAdmin,
      origin: request.nextUrl.origin,
    });

    return NextResponse.json({ agent });
  } catch (error) {
    console.warn('Failed to pause AI agent channel', {
      agentId,
      channelId: parsed.data.channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to pause AI agent channel' },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/ai-agents/[agentId]/pause',
    },
    () => pauseAgentChannel(request, context)
  );
}
