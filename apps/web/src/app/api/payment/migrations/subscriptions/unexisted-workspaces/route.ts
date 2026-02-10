import { createPolarClient } from '@tuturuuu/payment/polar/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import {
  createNDJSONStream,
  fetchAllRows,
  verifyAdminAccess,
} from '../../helper';

const WORKSPACE_CHUNK_SIZE = 200; // Avoid PostgREST URL length limits

async function fetchWorkspacesByIds(
  supabase: TypedSupabaseClient,
  ids: string[]
): Promise<Map<string, { deleted: boolean | null }>> {
  const workspaceMap = new Map<string, { deleted: boolean | null }>();

  // Process in chunks to avoid PostgREST URL length limits
  for (let i = 0; i < ids.length; i += WORKSPACE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + WORKSPACE_CHUNK_SIZE);

    const { data, error } = await supabase
      .from('workspaces')
      .select('id, deleted')
      .in('id', chunk);

    if (error) {
      throw new Error(
        `Failed to fetch workspaces: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (data) {
      for (const ws of data) {
        workspaceMap.set(ws.id, { deleted: ws.deleted });
      }
    }
  }

  return workspaceMap;
}

export async function DELETE() {
  const auth = await verifyAdminAccess();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sbAdmin = await createAdminClient();

  // Fetch all active subscriptions
  const { data: subscriptions, error: subError } = await fetchAllRows(
    (from, to) =>
      sbAdmin
        .from('workspace_subscriptions')
        .select('*')
        .eq('status', 'active')
        .range(from, to)
  );

  if (subError) {
    return NextResponse.json(
      {
        error: `Failed to fetch subscriptions: ${subError instanceof Error ? subError.message : String(subError)}`,
      },
      { status: 500 }
    );
  }

  // Collect unique workspace IDs from subscriptions
  const uniqueWsIds = [...new Set(subscriptions.map((sub) => sub.ws_id))];

  // Fetch workspace data in chunks
  let workspaceMap: Map<string, { deleted: boolean | null }>;
  try {
    workspaceMap = await fetchWorkspacesByIds(sbAdmin, uniqueWsIds);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to fetch workspaces',
      },
      { status: 500 }
    );
  }

  // Identify orphaned subscriptions
  // Workspace is "non-existent" if:
  // 1. No row exists in workspaces table (hard-deleted)
  // 2. Row exists but deleted = true (soft-deleted)
  const orphanedSubscriptions: typeof subscriptions = [];
  const validWorkspaceIds = new Set<string>();

  for (const [wsId, wsData] of workspaceMap) {
    if (wsData.deleted !== true) {
      validWorkspaceIds.add(wsId);
    }
  }

  for (const sub of subscriptions) {
    if (!validWorkspaceIds.has(sub.ws_id)) {
      orphanedSubscriptions.push(sub);
    }
  }

  const skipped = subscriptions.length - orphanedSubscriptions.length;

  return createNDJSONStream(async (send) => {
    const total = orphanedSubscriptions.length;
    let processed = 0; // Revoked count (using 'processed' to match existing pattern)
    let errors = 0;
    const errorDetails: Array<{ id: string; error: string }> = [];
    const startTime = Date.now();
    const polar = createPolarClient();

    // Count categories for detailed message
    let hardDeleted = 0;
    let softDeleted = 0;

    for (const sub of orphanedSubscriptions) {
      const wsData = workspaceMap.get(sub.ws_id);
      if (!wsData) {
        hardDeleted++;
      } else if (wsData.deleted === true) {
        softDeleted++;
      }
    }

    send({ type: 'start', total, skipped });

    for (let i = 0; i < orphanedSubscriptions.length; i++) {
      const sub = orphanedSubscriptions[i]!;

      try {
        await polar.subscriptions.revoke({
          id: sub.polar_subscription_id,
        });
        processed++;
      } catch (err) {
        errors++;
        errorDetails.push({
          id: sub.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      send({
        type: 'progress',
        current: i + 1,
        total,
        processed,
        skipped,
        errors,
      });
    }

    send({
      type: 'complete',
      total,
      processed,
      skipped,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      duration: Date.now() - startTime,
      message: `${subscriptions.length} active subscriptions scanned, ${processed} orphaned subscriptions revoked (${hardDeleted} hard-deleted, ${softDeleted} soft-deleted workspaces), ${skipped} valid workspace subscriptions skipped, ${errors} errors`,
    });
  });
}
