import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { after, type NextRequest, NextResponse } from 'next/server';
import { getAiAgentChannelById } from '@/lib/ai-agents/registry';
import {
  assertWebhookAdapter,
  createAiAgentChatRuntime,
} from '@/lib/ai-agents/runtime';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{
    adapter: string;
    channelId: string;
  }>;
}

async function handleWebhook(request: NextRequest, { params }: Params) {
  const { adapter: rawAdapter, channelId } = await params;
  let adapter: 'discord' | 'zalo';

  try {
    adapter = assertWebhookAdapter(rawAdapter);
  } catch {
    return NextResponse.json(
      { error: 'Unknown AI agent adapter' },
      { status: 404 }
    );
  }

  try {
    const resolved = await getAiAgentChannelById({
      adapter,
      channelId,
      origin: request.nextUrl.origin,
    });

    if (!resolved) {
      return NextResponse.json(
        { error: 'AI agent channel not found' },
        { status: 404 }
      );
    }

    const { agent, channel } = resolved;
    if (!agent.enabled || !channel.enabled || channel.status !== 'deployed') {
      return NextResponse.json(
        { error: 'AI agent channel is not deployed' },
        { status: 409 }
      );
    }

    if (adapter === 'zalo' && channel.zaloAccountMode === 'personal') {
      return NextResponse.json(
        { error: 'Personal Zalo channels use the listener lifecycle API' },
        { status: 404 }
      );
    }

    if (
      adapter === 'discord' &&
      request.headers.has('x-discord-gateway-token') &&
      channel.workspaceId !== ROOT_WORKSPACE_ID
    ) {
      return NextResponse.json(
        {
          error:
            'Discord Gateway forwarding is restricted to the internal workspace',
        },
        { status: 403 }
      );
    }

    const chat = await createAiAgentChatRuntime({ agent, channel });
    const handler = chat.webhooks[adapter];

    if (!handler) {
      return NextResponse.json(
        { error: 'AI agent adapter is not configured' },
        { status: 500 }
      );
    }

    return handler(request, {
      waitUntil: (task) => after(() => task),
    });
  } catch (error) {
    serverLogger.warn('Failed to handle AI agent webhook', {
      adapter,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to handle AI agent webhook' },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/webhooks/ai-agents/[adapter]/[channelId]',
    },
    () => handleWebhook(request, context)
  );
}
