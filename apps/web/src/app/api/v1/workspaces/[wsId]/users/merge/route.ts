import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type {
  MergeUsersRequest,
  PhasedMergeResult,
  PhaseResult,
} from '@tuturuuu/types/primitives';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

type AnySupabaseClient = any;

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const MergeRequestSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  // startTableIndex allows resuming from a specific table if timeout occurs
  startTableIndex: z.number().int().min(0).optional(),
});

interface RpcCollisionDetail {
  table: string;
  deleted_count: number;
  pk_column: string;
  deleted_pk_values: string[];
}

interface RpcPhaseResult {
  success: boolean;
  phase: number | string;
  error?: string;
  message?: string;
  migrated_tables?: string[];
  migrated_count?: number;
  collision_tables?: string[];
  collision_details?: RpcCollisionDetail[];
  custom_fields_merged?: number;
  link_transferred?: boolean;
  source_deleted?: boolean;
  source_platform_user_id?: string;
  target_platform_user_id?: string;
}

// All table/column pairs that need FK updates (Phase 1)
// Each entry is processed independently via direct queries (no RPC overhead)
const TABLE_COLUMN_PAIRS = [
  // High-volume financial/inventory tables
  { table: 'wallet_transactions', column: 'creator_id' },
  { table: 'product_stock_changes', column: 'beneficiary_id' },
  { table: 'product_stock_changes', column: 'creator_id' },
  { table: 'finance_invoices', column: 'customer_id' },
  { table: 'finance_invoices', column: 'creator_id' },
  // Status/report tables
  { table: 'workspace_user_status_changes', column: 'user_id' },
  { table: 'workspace_user_status_changes', column: 'creator_id' },
  { table: 'external_user_monthly_report_logs', column: 'user_id' },
  { table: 'external_user_monthly_report_logs', column: 'creator_id' },
  { table: 'external_user_monthly_reports', column: 'user_id' },
  { table: 'external_user_monthly_reports', column: 'creator_id' },
  { table: 'external_user_monthly_reports', column: 'updated_by' },
  { table: 'user_feedbacks', column: 'user_id' },
  { table: 'user_feedbacks', column: 'creator_id' },
  // Product/promotion/misc tables
  { table: 'workspace_products', column: 'creator_id' },
  { table: 'workspace_promotions', column: 'creator_id' },
  { table: 'workspace_promotions', column: 'owner_id' },
  { table: 'healthcare_checkups', column: 'patient_id' },
  { table: 'guest_users_lead_generation', column: 'user_id' },
  { table: 'sent_emails', column: 'receiver_id' },
  // User group/post/workforce tables
  { table: 'user_group_post_logs', column: 'creator_id' },
  { table: 'user_group_posts', column: 'creator_id' },
  { table: 'user_group_posts', column: 'updated_by' },
  { table: 'payroll_run_items', column: 'user_id' },
  { table: 'workforce_contracts', column: 'user_id' },
  { table: 'user_indicators', column: 'creator_id' },
] as const;

// Phases 2-5 handle composite PKs, custom fields, and final cleanup
const FINAL_PHASES = [
  { name: '2', fn: 'merge_workspace_users_phase2' },
  { name: '3', fn: 'merge_workspace_users_phase3' },
  { name: '4', fn: 'merge_workspace_users_phase4' },
  { name: '5', fn: 'merge_workspace_users_phase5' },
] as const;

interface MigrateResult {
  table: string;
  column: string;
  totalRowsUpdated: number;
  error?: string;
}

/**
 * Migrate all rows in a single table/column from sourceId to targetId
 * using direct Supabase query builder calls (no RPC overhead).
 *
 * Uses an admin (service_role) client to bypass RLS and BEFORE UPDATE
 * triggers that check auth.uid() — e.g. the handle_post_approval trigger
 * on user_group_posts which would otherwise reset approval status or
 * raise permission errors during merge operations.
 */
async function migrateTableColumn(
  supabase: AnySupabaseClient,
  table: string,
  column: string,
  sourceId: string,
  targetId: string
): Promise<MigrateResult> {
  // Count affected rows first (lightweight HEAD request)
  const { count, error: countError } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, sourceId);

  if (countError) {
    return { table, column, totalRowsUpdated: 0, error: countError.message };
  }

  const rowCount = count ?? 0;
  if (rowCount === 0) {
    return { table, column, totalRowsUpdated: 0 };
  }

  // Update all matching rows in a single query.
  // Using .eq() keeps the URL small (no .in() with hundreds of UUIDs).
  // The admin client bypasses RLS so there's no per-row policy overhead,
  // making single-query updates fast even for large tables.
  const { error } = await supabase
    .from(table)
    .update({ [column]: targetId })
    .eq(column, sourceId);

  if (error) {
    return { table, column, totalRowsUpdated: 0, error: error.message };
  }

  return { table, column, totalRowsUpdated: rowCount };
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId);

    // Verify the caller is a workspace member
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabaseAuth
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { message: 'Not a member of this workspace' },
        { status: 403 }
      );
    }

    // Check permissions - require both delete_users and update_users
    const permissions = await getPermissions({ wsId });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { withoutPermission } = permissions;
    if (
      withoutPermission('delete_users') ||
      withoutPermission('update_users')
    ) {
      return NextResponse.json(
        { message: 'Insufficient permissions to merge users' },
        { status: 403 }
      );
    }

    // Validate request body
    const body = (await req.json()) as MergeUsersRequest & {
      startTableIndex?: number;
    };
    const parsed = MergeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { sourceId, targetId, startTableIndex = 0 } = parsed.data;

    // Prevent self-merge
    if (sourceId === targetId) {
      return NextResponse.json(
        { message: 'Cannot merge user with itself' },
        { status: 400 }
      );
    }

    // Validate source and target users exist in this workspace BEFORE
    // creating the admin client. Uses user-context client so RLS ensures
    // the caller can actually see these workspace users.
    const { data: sourceUser, error: sourceError } = await supabaseAuth
      .from('workspace_users')
      .select('id')
      .eq('id', sourceId)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (sourceError) {
      return NextResponse.json(
        { message: 'Error validating source user', error: sourceError.message },
        { status: 500 }
      );
    }
    if (!sourceUser) {
      return NextResponse.json(
        { message: 'Source user not found in workspace' },
        { status: 404 }
      );
    }

    const { data: targetUser, error: targetError } = await supabaseAuth
      .from('workspace_users')
      .select('id')
      .eq('id', targetId)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json(
        { message: 'Error validating target user', error: targetError.message },
        { status: 500 }
      );
    }
    if (!targetUser) {
      return NextResponse.json(
        { message: 'Target user not found in workspace' },
        { status: 404 }
      );
    }

    // Admin client for data migration — only created AFTER workspace
    // membership is validated above. Bypasses RLS and auth.uid()-based
    // triggers (e.g. handle_post_approval on user_group_posts which
    // resets approval status on any UPDATE when the caller lacks
    // approve_posts permission).
    const sbAdmin = await createAdminClient();

    // Track progress
    const phaseResults: PhaseResult[] = [];
    const allMigratedTables: string[] = [];
    const allCollisionTables: string[] = [];
    const allCollisionDetails: RpcCollisionDetail[] = [];
    let customFieldsMerged = 0;
    let sourcePlatformUserId: string | undefined;
    let targetPlatformUserId: string | undefined;
    let totalRowsUpdated = 0;
    let lastCompletedTableIndex = startTableIndex - 1;

    // =========================================================================
    // PHASE 1: Migrate FK references using direct Supabase queries
    // Each SELECT+UPDATE pair completes in <1s (no RPC/PostgREST overhead)
    // =========================================================================
    for (
      let tableIndex = startTableIndex;
      tableIndex < TABLE_COLUMN_PAIRS.length;
      tableIndex++
    ) {
      const pair = TABLE_COLUMN_PAIRS[tableIndex];
      if (!pair) continue;

      const { table, column } = pair;

      const result = await migrateTableColumn(
        sbAdmin,
        table,
        column,
        sourceId,
        targetId
      );

      if (result.error) {
        console.error(`Error migrating ${table}.${column}:`, result.error);
        return NextResponse.json(
          {
            success: false,
            message: `Error updating ${table}.${column}: ${result.error}`,
            error: result.error,
            partial: true,
            completedTableIndex: lastCompletedTableIndex,
            nextTableIndex: tableIndex,
            currentTable: table,
            currentColumn: column,
            sourceUserId: sourceId,
            targetUserId: targetId,
            migratedTables: allMigratedTables,
            collisionTables: allCollisionTables,
            collisionDetails: allCollisionDetails,
            customFieldsMerged,
            totalRowsUpdated,
            phaseResults,
          },
          { status: 500 }
        );
      }

      totalRowsUpdated += result.totalRowsUpdated;

      if (result.totalRowsUpdated > 0) {
        allMigratedTables.push(
          `${table}.${column} (${result.totalRowsUpdated} rows)`
        );
      }

      lastCompletedTableIndex = tableIndex;

      // Log progress every 5 tables
      if ((tableIndex + 1) % 5 === 0) {
        console.log(
          `Phase 1 progress: ${tableIndex + 1}/${TABLE_COLUMN_PAIRS.length} tables, ` +
            `${totalRowsUpdated} total rows updated`
        );
      }
    }

    // Record Phase 1 result
    phaseResults.push({
      success: true,
      phase: 1,
      migrated_count: totalRowsUpdated,
      migrated_tables: allMigratedTables.slice(),
      message: `Completed ${TABLE_COLUMN_PAIRS.length} table/column updates`,
    });

    // =========================================================================
    // PHASES 2-5: Composite PKs, custom fields, link transfer, final merge
    // These RPC functions are SECURITY DEFINER (bypass RLS internally) but
    // validate auth.uid() at the top — so they MUST be called with the
    // user-context client, NOT the admin client (which has auth.uid()=NULL).
    // Phase 1 uses sbAdmin because direct queries trigger BEFORE UPDATE
    // approval triggers that check auth.uid(); phases 2-5 don't touch those.
    // =========================================================================
    for (let i = 0; i < FINAL_PHASES.length; i++) {
      const phase = FINAL_PHASES[i];
      if (!phase) continue;

      const phaseNumber = i + 2; // Phases 2, 3, 4, 5

      const { data, error } = await (supabaseAuth.rpc as CallableFunction)(
        phase.fn,
        {
          _source_id: sourceId,
          _target_id: targetId,
          _ws_id: wsId,
        }
      );

      if (error) {
        if (error.code === '57014') {
          console.error(`Phase ${phase.name} timed out:`, error);
          return NextResponse.json(
            {
              success: false,
              message: `Phase ${phase.name} timed out.`,
              error: error.message,
              partial: true,
              completedPhase: phaseNumber - 1,
              nextPhase: phaseNumber,
              sourceUserId: sourceId,
              targetUserId: targetId,
              migratedTables: allMigratedTables,
              collisionTables: allCollisionTables,
              collisionDetails: allCollisionDetails,
              customFieldsMerged,
              totalRowsUpdated,
              phaseResults,
            },
            { status: 408 }
          );
        }

        console.error(`Error in phase ${phase.name}:`, error);
        return NextResponse.json(
          {
            success: false,
            message: `Error in phase ${phase.name}`,
            error: error.message,
            partial: true,
            completedPhase: phaseNumber - 1,
            nextPhase: phaseNumber,
            sourceUserId: sourceId,
            targetUserId: targetId,
            migratedTables: allMigratedTables,
            collisionTables: allCollisionTables,
            collisionDetails: allCollisionDetails,
            customFieldsMerged,
            totalRowsUpdated,
            phaseResults,
          },
          { status: 500 }
        );
      }

      const phaseResult = data as RpcPhaseResult;

      const clientPhaseResult: PhaseResult = {
        success: phaseResult.success,
        phase: phaseNumber,
        error: phaseResult.error,
        message: phaseResult.message,
        migrated_tables: phaseResult.migrated_tables,
        migrated_count: phaseResult.migrated_count,
        collision_tables: phaseResult.collision_tables,
        collision_details: phaseResult.collision_details,
        custom_fields_merged: phaseResult.custom_fields_merged,
        link_transferred: phaseResult.link_transferred,
        source_deleted: phaseResult.source_deleted,
        source_platform_user_id: phaseResult.source_platform_user_id,
        target_platform_user_id: phaseResult.target_platform_user_id,
      };
      phaseResults.push(clientPhaseResult);

      if (!phaseResult.success) {
        return NextResponse.json(
          {
            success: false,
            message: phaseResult.error || `Phase ${phase.name} failed`,
            partial: true,
            completedPhase: phaseNumber - 1,
            nextPhase: phaseNumber,
            sourceUserId: sourceId,
            targetUserId: targetId,
            migratedTables: allMigratedTables,
            collisionTables: allCollisionTables,
            collisionDetails: allCollisionDetails,
            customFieldsMerged,
            sourcePlatformUserId: phaseResult.source_platform_user_id,
            targetPlatformUserId: phaseResult.target_platform_user_id,
            totalRowsUpdated,
            phaseResults,
          },
          { status: 400 }
        );
      }

      // Accumulate results
      if (phaseResult.migrated_tables) {
        allMigratedTables.push(...phaseResult.migrated_tables);
      }
      if (phaseResult.collision_tables) {
        allCollisionTables.push(...phaseResult.collision_tables);
      }
      if (phaseResult.collision_details) {
        allCollisionDetails.push(...phaseResult.collision_details);
      }
      if (phaseResult.custom_fields_merged) {
        customFieldsMerged = phaseResult.custom_fields_merged;
      }
      if (phaseResult.link_transferred) {
        allMigratedTables.push(
          'workspace_user_linked_users (link transferred)'
        );
      }
      if (phaseResult.source_platform_user_id) {
        sourcePlatformUserId = phaseResult.source_platform_user_id;
      }
      if (phaseResult.target_platform_user_id) {
        targetPlatformUserId = phaseResult.target_platform_user_id;
      }
    }

    // All phases completed successfully
    const result: PhasedMergeResult = {
      success: true,
      sourceUserId: sourceId,
      targetUserId: targetId,
      migratedTables: allMigratedTables,
      collisionTables: allCollisionTables,
      collisionDetails: allCollisionDetails,
      customFieldsMerged,
      sourcePlatformUserId,
      targetPlatformUserId,
      completedPhase: 5,
      partial: false,
      phaseResults,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error merging users:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
