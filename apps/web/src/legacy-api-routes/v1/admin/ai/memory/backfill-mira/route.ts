import { rememberAiMemory, resolveAiMemoryScope } from '@tuturuuu/ai/memory';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const BackfillSchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

type LegacyMiraMemory = {
  category: string;
  id: string;
  key: string;
  updated_at: string;
  user_id: string;
  value: string;
};

type PersonalWorkspaceRow = {
  id: string | null;
};

async function resolvePersonalWorkspaceId(
  sbAdmin: TypedSupabaseClient,
  userId: string
) {
  const { data } = await sbAdmin
    .from('workspaces')
    .select('id, workspace_members!inner(user_id)')
    .eq('personal', true)
    .eq('workspace_members.user_id', userId)
    .maybeSingle();

  const workspace = data as PersonalWorkspaceRow | null;
  return workspace?.id ?? null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user?.id || !isValidTuturuuuEmail(user.email ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = BackfillSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid backfill payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const { data: runId, error: runError } = await sbAdmin.schema('private').rpc(
    'create_ai_memory_backfill_run' as never,
    {
      p_actor_user_id: user.id,
    } as never
  );

  if (runError || !runId) {
    console.error('Failed to create AI memory backfill run', {
      error: runError,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to create backfill run' },
      { status: 500 }
    );
  }

  await sbAdmin
    .schema('private')
    .from('ai_memory_backfill_runs' as never)
    .update({
      started_at: new Date().toISOString(),
      status: 'running',
    } as never)
    .eq('id' as never, runId as never);

  const { data: memories, error } = await sbAdmin
    .from('mira_memories')
    .select('id, user_id, category, key, value, updated_at')
    .order('updated_at', { ascending: true })
    .range(parsed.data.offset, parsed.data.offset + parsed.data.limit - 1);

  if (error) {
    await sbAdmin
      .schema('private')
      .from('ai_memory_backfill_runs' as never)
      .update({
        error: error.message,
        finished_at: new Date().toISOString(),
        status: 'failed',
      } as never)
      .eq('id' as never, runId as never);
    return NextResponse.json(
      { error: 'Failed to load legacy Mira memories' },
      { status: 500 }
    );
  }

  let imported = 0;
  let skipped = 0;
  const workspaceCache = new Map<string, string | null>();

  for (const memory of (memories ?? []) as LegacyMiraMemory[]) {
    let wsId = workspaceCache.get(memory.user_id);
    if (wsId === undefined) {
      wsId = await resolvePersonalWorkspaceId(sbAdmin, memory.user_id);
      workspaceCache.set(memory.user_id, wsId);
    }

    if (!wsId) {
      skipped += 1;
      continue;
    }

    const scope = resolveAiMemoryScope({
      customId: `legacy-mira-${memory.id}`,
      metadata: {
        legacyMemoryId: memory.id,
        legacyUpdatedAt: memory.updated_at,
      },
      product: 'mira',
      source: 'legacy_mira_memories',
      surface: 'mira_backfill',
      userId: memory.user_id,
      wsId,
    });
    const result = await rememberAiMemory({
      category: memory.category,
      ignoreSettings: true,
      key: memory.key,
      scope,
      value: memory.value,
    });

    if (result.ok && !result.skipped) imported += 1;
    else skipped += 1;
  }

  await sbAdmin
    .schema('private')
    .from('ai_memory_backfill_runs' as never)
    .update({
      finished_at: new Date().toISOString(),
      imported_count: imported,
      skipped_count: skipped,
      status: 'succeeded',
    } as never)
    .eq('id' as never, runId as never);

  return NextResponse.json({
    imported,
    runId,
    skipped,
    total: memories?.length ?? 0,
  });
}
