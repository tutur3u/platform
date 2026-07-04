import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rotateAiAgentChannelSecret } from '@/lib/ai-agents/registry';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../../../../access';

interface Params {
  params: Promise<{
    agentId: string;
    channelId: string;
  }>;
}

const secretSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,80}$/u),
  value: z.string().trim().max(3900).optional(),
});

async function rotateSecret(request: NextRequest, { params }: Params) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { agentId, channelId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = secretSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid AI agent secret payload' },
      { status: 400 }
    );
  }

  try {
    const secret = await rotateAiAgentChannelSecret({
      agentId,
      channelId,
      db: access.sbAdmin,
      secretName: parsed.data.name,
      value: parsed.data.value,
    });

    return NextResponse.json({ secret });
  } catch (error) {
    console.warn('Failed to rotate AI agent channel secret', {
      agentId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
      secretName: parsed.data.name,
    });
    return NextResponse.json(
      { error: 'Failed to rotate AI agent channel secret' },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/infrastructure/ai-agents/[agentId]/channels/[channelId]/secrets',
    },
    () => rotateSecret(request, context)
  );
}
