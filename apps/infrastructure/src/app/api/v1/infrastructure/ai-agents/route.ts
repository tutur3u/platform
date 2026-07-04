import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  listAiAgents,
  listZaloIdentityLinks,
  saveAiAgent,
} from '@/lib/ai-agents/registry';
import {
  AI_AGENT_ADAPTERS,
  AI_AGENT_ALLOWED_TOOLS,
} from '@/lib/ai-agents/types';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from './access';

const channelSchema = z.object({
  adapter: z.enum(AI_AGENT_ADAPTERS),
  displayName: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,80}$/u),
  mentionRoleIds: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  secrets: z
    .record(z.string().trim().min(1).max(80), z.string().max(3900).nullable())
    .optional(),
  status: z.enum(['draft', 'deployed', 'error', 'paused']).optional(),
  workspaceId: z.string().trim().min(1).max(128),
  autoRespond: z.boolean().optional(),
  discordGuildId: z.string().trim().max(128).nullable().optional(),
  externalChannelId: z.string().trim().max(255).nullable().optional(),
  historySyncEnabled: z.boolean().optional(),
  zaloAccountMode: z.enum(['official', 'personal']).optional(),
  zaloOfficialAccountId: z.string().trim().max(128).nullable().optional(),
  zaloPersonalOwnId: z.string().trim().max(128).nullable().optional(),
});

const agentSchema = z.object({
  channels: z.array(channelSchema).max(8).optional(),
  enabled: z.boolean().optional(),
  id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,80}$/u),
  instructions: z.string().max(24_000).optional(),
  modelId: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().min(1).max(120),
  temperature: z.number().min(0).max(2).nullable().optional(),
  tools: z.array(z.enum(AI_AGENT_ALLOWED_TOOLS)).max(50).optional(),
});

async function listAgents(request: NextRequest) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  try {
    const [agents, identities] = await Promise.all([
      listAiAgents({ db: access.sbAdmin, origin: request.nextUrl.origin }),
      listZaloIdentityLinks(access.sbAdmin),
    ]);

    return NextResponse.json({ agents, identities });
  } catch (error) {
    console.error('Failed to list AI agents', error);
    return NextResponse.json(
      { error: 'Failed to list AI agents' },
      { status: 500 }
    );
  }
}

async function saveAgent(request: NextRequest) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = agentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid AI agent payload' },
      { status: 400 }
    );
  }

  try {
    const agent = await saveAiAgent({
      actorUserId: access.user.id,
      db: access.sbAdmin,
      origin: request.nextUrl.origin,
      payload: parsed.data,
    });

    return NextResponse.json({ agent });
  } catch (error) {
    console.warn('Failed to save AI agent', {
      error: error instanceof Error ? error.message : String(error),
      id: parsed.data.id,
    });
    return NextResponse.json(
      { error: 'Failed to save AI agent' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/ai-agents',
    },
    () => listAgents(request)
  );
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/ai-agents',
    },
    () => saveAgent(request)
  );
}
