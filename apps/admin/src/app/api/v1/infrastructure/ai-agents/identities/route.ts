import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  listZaloIdentityLinks,
  saveZaloIdentityLink,
} from '@/lib/ai-agents/registry';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../access';

const identitySchema = z.object({
  externalUserId: z.string().trim().min(1).max(128),
  platformUserId: z.string().trim().min(1).max(128),
  provider: z.literal('zalo').default('zalo'),
  providerAccountId: z.string().trim().min(1).max(128),
  workspaceId: z.string().trim().min(1).max(128),
});

async function listIdentities(request: NextRequest) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  return NextResponse.json({
    identities: await listZaloIdentityLinks(access.sbAdmin),
  });
}

async function saveIdentity(request: NextRequest) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = identitySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid AI agent identity payload' },
      { status: 400 }
    );
  }

  try {
    const identity = await saveZaloIdentityLink({
      db: access.sbAdmin,
      link: parsed.data,
    });

    return NextResponse.json({ identity });
  } catch (error) {
    console.warn('Failed to save AI agent identity link', {
      error: error instanceof Error ? error.message : String(error),
      externalUserId: parsed.data.externalUserId,
    });
    return NextResponse.json(
      { error: 'Failed to save AI agent identity link' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/ai-agents/identities',
    },
    () => listIdentities(request)
  );
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/infrastructure/ai-agents/identities',
    },
    () => saveIdentity(request)
  );
}
