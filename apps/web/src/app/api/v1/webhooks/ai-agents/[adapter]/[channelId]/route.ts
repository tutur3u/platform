import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { after, type NextRequest, NextResponse } from 'next/server';
import { getAiAgentChannelById } from '@/lib/ai-agents/registry';
import {
  assertWebhookAdapter,
  createAiAgentChatRuntime,
} from '@/lib/ai-agents/runtime';
import type { AiAgentChannelConfig } from '@/lib/ai-agents/types';
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readGatewayChannelIds(data: Record<string, unknown>) {
  const channelIds = new Set<string>();
  const directChannelId = readString(data.channel_id);
  const thread = asRecord(data.thread);
  const parentChannelId = readString(thread?.parent_id);

  if (directChannelId) channelIds.add(directChannelId);
  if (parentChannelId) channelIds.add(parentChannelId);

  return channelIds;
}

async function validateDiscordGatewayBinding(
  request: Request,
  channel: AiAgentChannelConfig
) {
  const expectedGuildId = channel.discordGuildId?.trim() || null;
  const expectedChannelId = channel.externalChannelId?.trim() || null;

  if (!expectedGuildId || !expectedChannelId) {
    return NextResponse.json(
      {
        error:
          'Discord Gateway forwarding requires a configured guild and channel binding',
      },
      { status: 403 }
    );
  }

  const payload = asRecord(await request.json().catch(() => null));
  const data = asRecord(payload?.data);

  if (!data) {
    return NextResponse.json(
      { error: 'Invalid Discord Gateway event payload' },
      { status: 400 }
    );
  }

  const guildId = readString(data.guild_id);
  const channelIds = readGatewayChannelIds(data);

  if (guildId !== expectedGuildId || !channelIds.has(expectedChannelId)) {
    return NextResponse.json(
      {
        error:
          'Discord Gateway event does not match the configured AI agent channel',
      },
      { status: 403 }
    );
  }

  return null;
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
      request.headers.has('x-discord-gateway-token')
    ) {
      if (channel.workspaceId !== ROOT_WORKSPACE_ID) {
        return NextResponse.json(
          {
            error:
              'Discord Gateway forwarding is restricted to the internal workspace',
          },
          { status: 403 }
        );
      }

      const bindingError = await validateDiscordGatewayBinding(
        request.clone(),
        channel
      );
      if (bindingError) return bindingError;
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
