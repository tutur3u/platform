import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type ChatIntegrationKind,
  createChatIntegrationChannel,
} from '@/lib/ai-agents/chat-integrations';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../access';

const chatIntegrationSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(['discord', 'zalo-official', 'zalo-personal']),
});

async function createIntegration(request: NextRequest) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = chatIntegrationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid chat integration payload' },
      { status: 400 }
    );
  }

  try {
    const result = await createChatIntegrationChannel({
      actorUserId: access.user.id,
      db: access.sbAdmin,
      displayName: parsed.data.displayName,
      kind: parsed.data.kind as ChatIntegrationKind,
      origin: request.nextUrl.origin,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    serverLogger.warn('Failed to create chat integration channel', {
      error: error instanceof Error ? error.message : String(error),
      kind: parsed.data.kind,
    });
    return NextResponse.json(
      { error: 'Failed to create chat integration channel' },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/ai-agents/chat-integrations',
    },
    () => createIntegration(request)
  );
}
