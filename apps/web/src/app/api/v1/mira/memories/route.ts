import {
  type AiMemoryDocument,
  forgetAiMemory,
  listAiMemories,
  rememberAiMemory,
  resolveAiMemoryScope,
} from '@tuturuuu/ai/memory';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MAX_SUPPORT_INQUIRY_LENGTH } from '@tuturuuu/utils/constants';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const memoryCategories = [
  'preference',
  'fact',
  'conversation_topic',
  'event',
  'person',
] as const;

const createMemorySchema = z.object({
  category: z.enum(memoryCategories),
  confidence: z.number().min(0).max(1).optional().default(1.0),
  key: z.string().min(1).max(200),
  source: z.string().max(200).optional(),
  value: z.string().min(1).max(MAX_SUPPORT_INQUIRY_LENGTH),
});

const deleteMemorySchema = z.object({
  memory_id: z.string().min(1).max(300),
});

type MiraMemoryCategory = (typeof memoryCategories)[number];

type MemoryContext =
  | {
      ok: false;
      response: NextResponse;
    }
  | {
      ok: true;
      userId: string;
      wsId: string;
    };

type DefaultWorkspaceRow = {
  default_workspace_id: string | null;
};

type PersonalWorkspaceRow = {
  id: string | null;
};

async function resolveDefaultWorkspaceId(
  sbAdmin: TypedSupabaseClient,
  userId: string
) {
  const { data: userPrivateDetails } = await sbAdmin
    .from('user_private_details')
    .select('default_workspace_id')
    .eq('user_id', userId)
    .maybeSingle();

  const privateDetails = userPrivateDetails as DefaultWorkspaceRow | null;
  if (privateDetails?.default_workspace_id) {
    return privateDetails.default_workspace_id;
  }

  const { data: personalWorkspace } = await sbAdmin
    .from('workspaces')
    .select('id, workspace_members!inner(user_id)')
    .eq('personal', true)
    .eq('workspace_members.user_id', userId)
    .limit(1)
    .maybeSingle();

  const workspace = personalWorkspace as PersonalWorkspaceRow | null;
  return workspace?.id ?? null;
}

async function resolveMiraMemoryContext(
  request: NextRequest
): Promise<MemoryContext> {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const requestedWsId = request.nextUrl.searchParams.get('wsId');
  let wsId: string | null = null;

  if (requestedWsId) {
    try {
      wsId = await normalizeWorkspaceId(requestedWsId, supabase, request);
    } catch (error) {
      serverLogger.warn('Failed to normalize Mira memory workspace id', error);
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Invalid workspace identifier' },
          { status: 422 }
        ),
      };
    }
  } else {
    wsId = await resolveDefaultWorkspaceId(sbAdmin, user.id);
  }

  if (!wsId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Workspace is required' },
        { status: 400 }
      ),
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: sbAdmin,
    userId: user.id,
    wsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    serverLogger.error('Failed to verify Mira memory workspace access', {
      userId: user.id,
      wsId,
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: user.id,
    wsId,
  };
}

function mapMemoryDocument({
  category,
  content,
  id,
  key,
  metadata,
  summary,
  title,
  updatedAt,
}: AiMemoryDocument) {
  const memoryCategory =
    category && memoryCategories.includes(category as MiraMemoryCategory)
      ? (category as MiraMemoryCategory)
      : 'fact';
  const memoryKey = key || title || 'Memory';
  const memoryValue = content || summary || title || '';

  return {
    category: memoryCategory,
    confidence: 1,
    created_at: updatedAt,
    id,
    key: memoryKey,
    last_referenced_at: null,
    source: typeof metadata?.source === 'string' ? metadata.source : null,
    updated_at: updatedAt,
    user_id: typeof metadata?.userId === 'string' ? metadata.userId : '',
    value: memoryValue,
  };
}

function groupMemories<TMemory extends { category: string }>(
  memories: TMemory[]
) {
  return memories.reduce(
    (acc, memory) => {
      const bucket = acc[memory.category] ?? [];
      bucket.push(memory);
      acc[memory.category] = bucket;
      return acc;
    },
    {} as Record<string, TMemory[]>
  );
}

export async function GET(request: NextRequest) {
  const context = await resolveMiraMemoryContext(request);
  if (!context.ok) return context.response;

  const category = request.nextUrl.searchParams.get('category');
  const limit = Math.min(
    Number.parseInt(request.nextUrl.searchParams.get('limit') || '100', 10) ||
      100,
    500
  );
  const scope = resolveAiMemoryScope({
    customId: 'mira-memory-controls',
    product: 'mira',
    source: 'mira_memory_api',
    surface: 'mira_memory_controls',
    userId: context.userId,
    wsId: context.wsId,
  });
  const result = await listAiMemories({
    category,
    ignoreSettings: true,
    limit,
    scope,
  });

  if (!result.ok) {
    serverLogger.error('Failed to load Mira AI memories', {
      error: result.error,
      userId: context.userId,
      wsId: context.wsId,
    });
    return NextResponse.json(
      { error: 'Failed to get memories' },
      { status: 500 }
    );
  }

  const memories = (result.value ?? []).map(mapMemoryDocument);

  return NextResponse.json({
    grouped: groupMemories(memories),
    memories,
    total: memories.length,
  });
}

export async function POST(request: NextRequest) {
  const context = await resolveMiraMemoryContext(request);
  if (!context.ok) return context.response;

  const parsed = createMemorySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request data', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { category, confidence, key, source, value } = parsed.data;
  const scope = resolveAiMemoryScope({
    customId: `mira-manual-${category}-${key}`,
    metadata: {
      confidence,
      source: source ?? 'mira_memory_api',
    },
    product: 'mira',
    source: source ?? 'mira_memory_api',
    surface: 'mira_memory_controls',
    userId: context.userId,
    wsId: context.wsId,
  });
  const result = await rememberAiMemory({
    category,
    ignoreSettings: true,
    key,
    scope,
    value,
  });

  if (!result.ok) {
    serverLogger.error('Failed to save Mira AI memory', {
      error: result.error,
      userId: context.userId,
      wsId: context.wsId,
    });
    return NextResponse.json(
      { error: 'Failed to save memory' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    memory: {
      category,
      confidence,
      created_at: new Date().toISOString(),
      id: result.value?.id ?? scope?.customId ?? key,
      key,
      last_referenced_at: null,
      source: source ?? null,
      updated_at: new Date().toISOString(),
      user_id: context.userId,
      value,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const context = await resolveMiraMemoryContext(request);
  if (!context.ok) return context.response;

  const parsed = deleteMemorySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request data', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const scope = resolveAiMemoryScope({
    customId: `mira-delete-${parsed.data.memory_id}`,
    product: 'mira',
    source: 'mira_memory_api',
    surface: 'mira_memory_controls',
    userId: context.userId,
    wsId: context.wsId,
  });
  const result = await forgetAiMemory({
    ignoreSettings: true,
    memoryId: parsed.data.memory_id,
    scope,
  });

  if (!result.ok) {
    serverLogger.error('Failed to delete Mira AI memory', {
      error: result.error,
      memoryId: parsed.data.memory_id,
      userId: context.userId,
      wsId: context.wsId,
    });
    return NextResponse.json(
      { error: 'Failed to delete memory' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
