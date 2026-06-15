import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';
import { getRootSecretValue, listAiAgents } from '@/lib/ai-agents/registry';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';

const WATCHER_SECRET_NAME = 'AI_AGENT_DISCORD_GATEWAY_WATCHER_SECRET';

function readBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const [scheme, ...parts] = authorization.trim().split(/\s+/u);

  if (scheme?.toLowerCase() !== 'bearer') {
    return null;
  }

  return parts.join(' ').trim() || null;
}

function secretsMatch(candidate: string, configured: string) {
  const candidateBuffer = Buffer.from(candidate);
  const configuredBuffer = Buffer.from(configured);

  return (
    candidateBuffer.length === configuredBuffer.length &&
    timingSafeEqual(candidateBuffer, configuredBuffer)
  );
}

async function readWatcherSecret(db: TypedSupabaseClient) {
  const envSecret = process.env[WATCHER_SECRET_NAME]?.trim();

  if (envSecret) {
    return envSecret;
  }

  return (await getRootSecretValue(WATCHER_SECRET_NAME, db))?.trim() || null;
}

async function handleGet(request: NextRequest) {
  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const configuredSecret = await readWatcherSecret(sbAdmin);

  if (!configuredSecret) {
    return NextResponse.json(
      { error: 'Discord Gateway watcher secret is not configured' },
      { status: 500 }
    );
  }

  const bearerToken = readBearerToken(request);

  if (!bearerToken || !secretsMatch(bearerToken, configuredSecret)) {
    return NextResponse.json(
      { error: 'Invalid Discord Gateway watcher credentials' },
      { status: 401 }
    );
  }

  const requestedChannelId =
    request.nextUrl.searchParams.get('channelId')?.trim().toLowerCase() || null;
  const agents = await listAiAgents({
    db: sbAdmin,
    origin: request.nextUrl.origin,
  });

  const targets = agents.flatMap((agent) =>
    agent.channels
      .filter((channel) => {
        if (requestedChannelId && channel.id !== requestedChannelId) {
          return false;
        }

        return (
          agent.enabled &&
          channel.adapter === 'discord' &&
          channel.enabled &&
          channel.status === 'deployed' &&
          channel.workspaceId === ROOT_WORKSPACE_ID &&
          Boolean(channel.discordGuildId?.trim()) &&
          Boolean(channel.externalChannelId?.trim()) &&
          Boolean(channel.webhookUrl)
        );
      })
      .map((channel) => ({
        agentId: agent.id,
        channelId: channel.id,
        discordGuildId: channel.discordGuildId ?? null,
        externalChannelId: channel.externalChannelId ?? null,
        webhookUrl: channel.webhookUrl,
        workspaceId: channel.workspaceId,
      }))
  );

  return NextResponse.json({ targets });
}

export async function GET(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/ai-agents/discord-gateway/watcher-config',
    },
    async () => {
      try {
        return await handleGet(request);
      } catch (error) {
        serverLogger.warn(
          'Failed to resolve Discord Gateway watcher configuration',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
        return NextResponse.json(
          { error: 'Failed to resolve Discord Gateway watcher configuration' },
          { status: 500 }
        );
      }
    }
  );
}
