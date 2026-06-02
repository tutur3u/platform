import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAiAgentById } from '@/lib/ai-agents/registry';
import type {
  AiAgentChannelConfig,
  AiAgentDefinition,
  AiAgentDiagnosticCheck,
} from '@/lib/ai-agents/types';
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

    const checks = buildChannelDiagnostics({ agent, channel });
    const failed = checks.filter((check) => !check.ok);

    return NextResponse.json({
      checks,
      ok: failed.length === 0,
      response: failed.length
        ? `AI agent channel needs attention: ${failed
            .map((check) => check.label)
            .join(', ')}.`
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

function buildChannelDiagnostics({
  agent,
  channel,
}: {
  agent: AiAgentDefinition;
  channel: AiAgentChannelConfig;
}): AiAgentDiagnosticCheck[] {
  const missingSecrets = requiredSecretNames(channel).filter((name) => {
    const secret = channel.secrets.find((item) => item.name === name);
    return !secret?.configured;
  });
  const hasAdapterAccount =
    channel.adapter === 'discord'
      ? Boolean(channel.discordGuildId?.trim())
      : Boolean(channel.zaloOfficialAccountId?.trim());

  return [
    {
      detail: agent.enabled ? null : 'Enable the agent before deployment.',
      id: 'agent_enabled',
      label: 'Agent enabled',
      ok: agent.enabled,
    },
    {
      detail: channel.enabled ? null : 'Enable this channel before deployment.',
      id: 'channel_enabled',
      label: 'Channel enabled',
      ok: channel.enabled,
    },
    {
      detail:
        channel.status === 'deployed'
          ? channel.lastDeployedAt
          : `Current status: ${channel.status}`,
      id: 'channel_deployed',
      label: 'Channel deployed',
      ok: channel.status === 'deployed',
    },
    {
      detail: missingSecrets.length
        ? `Missing channel secrets: ${missingSecrets.join(', ')}`
        : 'All required channel secrets are configured.',
      id: 'required_secrets',
      label: 'Required secrets',
      ok: missingSecrets.length === 0,
    },
    {
      detail: channel.webhookUrl || 'Deploy the channel to generate a webhook.',
      id: 'webhook_url',
      label: 'Webhook URL',
      ok: Boolean(channel.webhookUrl),
    },
    {
      detail: channel.workspaceId || 'Choose a workspace for this channel.',
      id: 'workspace_mapping',
      label: 'Workspace mapping',
      ok: Boolean(channel.workspaceId?.trim()),
    },
    {
      detail:
        channel.adapter === 'discord'
          ? channel.discordGuildId || 'Set the Discord guild ID.'
          : channel.zaloOfficialAccountId ||
            'Set the Zalo official account ID.',
      id: 'adapter_account',
      label:
        channel.adapter === 'discord'
          ? 'Discord guild mapping'
          : 'Zalo account mapping',
      ok: hasAdapterAccount,
    },
    {
      detail: channel.lastError || 'No recent channel error.',
      id: 'last_error',
      label: 'Recent error',
      ok: !channel.lastError,
    },
    {
      detail: channel.lastEventAt || 'No external event has been mirrored yet.',
      id: 'last_event',
      label: 'Last external event',
      ok: true,
    },
  ];
}

function requiredSecretNames(channel: AiAgentChannelConfig) {
  return channel.adapter === 'discord'
    ? ['applicationId', 'publicKey', 'botToken']
    : ['botToken', 'webhookSecret'];
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
