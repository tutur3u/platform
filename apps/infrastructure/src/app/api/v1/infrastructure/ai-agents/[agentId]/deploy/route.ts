import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deployAiAgentChannel } from '@/lib/ai-agents/registry';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../../access';

interface Params {
  params: Promise<{
    agentId: string;
  }>;
}

const deploySchema = z.object({
  channelId: z.string().trim().min(1).max(80),
});

async function deployAgentChannel(request: NextRequest, { params }: Params) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { agentId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = deploySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid AI agent deploy payload' },
      { status: 400 }
    );
  }

  try {
    const result = await deployAiAgentChannel({
      agentId,
      channelId: parsed.data.channelId,
      db: access.sbAdmin,
      origin: request.nextUrl.origin,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.warn('Failed to deploy AI agent channel', {
      agentId,
      channelId: parsed.data.channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to deploy AI agent channel' },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/ai-agents/[agentId]/deploy',
    },
    () => deployAgentChannel(request, context)
  );
}
