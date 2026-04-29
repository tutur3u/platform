import { DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { listWorkspaceDefaultIncludedGroupIds } from '@/lib/workspace-default-included-groups';

type AutoApprovalSummary = {
  posts: number;
  reports: number;
};

type WorkspaceConfigUpdates = Record<string, string>;

const BOOLEAN_CONFIG_KEYS = new Set([
  'ENABLE_POST_APPROVAL',
  'ENABLE_REPORT_APPROVAL',
  'ENABLE_REPORT_EXPORT_ONLY_APPROVED',
  'ENABLE_REPORT_PENDING_WATERMARK',
  'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD',
  'INVOICE_USE_ATTENDANCE_BASED_CALCULATION',
  'INVOICE_GROUP_PENDING_INVOICES_BY_USER',
]);

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const supabase = await createClient(req);
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const idsRaw =
      searchParams
        .get('ids')
        ?.split(',')
        .map((id) => id.trim()) ?? [];

    if (idsRaw.length === 0) {
      return NextResponse.json({});
    }

    const uniqueIds = [...new Set(idsRaw)];
    const ids = uniqueIds.filter(Boolean);
    const shouldResolveDefaultIncludedGroups = ids.includes(
      DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID
    );
    const workspaceConfigIds = ids.filter(
      (id) => id !== DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID
    );

    let configs: { id: string; value: string }[] = [];

    if (workspaceConfigIds.length > 0) {
      const { data, error } = await sbAdmin
        .from('workspace_configs')
        .select('id, value')
        .eq('ws_id', wsId)
        .in('id', workspaceConfigIds);

      if (error) {
        console.error('Error fetching workspace configs:', error);
        return NextResponse.json(
          { error: 'Failed to fetch workspace configs' },
          { status: 500 }
        );
      }

      configs = data ?? [];
    }

    const defaultIncludedGroups = shouldResolveDefaultIncludedGroups
      ? await listWorkspaceDefaultIncludedGroupIds(sbAdmin, wsId)
      : { data: [] as string[] };

    if (defaultIncludedGroups.errorMessage) {
      console.error(
        'Error fetching default included user groups:',
        defaultIncludedGroups.errorMessage
      );
      return NextResponse.json(
        { error: 'Failed to fetch workspace configs' },
        { status: 500 }
      );
    }

    const configMap = new Map<string, string>(
      (configs ?? []).map((config) => [config.id, config.value])
    );
    const result: Record<string, string | null> = {};
    for (const id of ids) {
      if (id === DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID) {
        result[id] =
          defaultIncludedGroups.data.length > 0
            ? defaultIncludedGroups.data.join(',')
            : null;
        continue;
      }

      result[id] = configMap.get(id) ?? null;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in workspace configs API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const supabase = await createClient(req);
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const permissions = await getPermissions({ wsId, request: req });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (permissions.withoutPermission('manage_workspace_settings')) {
      return NextResponse.json(
        { error: 'Insufficient permissions to manage workspace settings' },
        { status: 403 }
      );
    }

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (
      !parsedBody ||
      typeof parsedBody !== 'object' ||
      Array.isArray(parsedBody)
    ) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsedEntries = Object.entries(parsedBody);
    if (parsedEntries.length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    const parsedUpdates: WorkspaceConfigUpdates = {};

    for (const [key, value] of parsedEntries) {
      if (typeof value !== 'string') {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        );
      }

      if (
        BOOLEAN_CONFIG_KEYS.has(key) &&
        value !== 'true' &&
        value !== 'false'
      ) {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        );
      }

      parsedUpdates[key] = value;
    }

    if (Object.keys(parsedUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    const needsApprovalActor =
      parsedUpdates.ENABLE_POST_APPROVAL !== undefined ||
      parsedUpdates.ENABLE_REPORT_APPROVAL !== undefined;

    let actorVirtualUserId: string | undefined;

    if (needsApprovalActor) {
      const { data: workspaceUser, error: workspaceUserError } = await sbAdmin
        .from('workspace_user_linked_users')
        .select('virtual_user_id')
        .eq('platform_user_id', user.id)
        .eq('ws_id', wsId)
        .maybeSingle();

      if (workspaceUserError) {
        return NextResponse.json(
          { error: 'Failed to resolve workspace user mapping' },
          { status: 500 }
        );
      }

      actorVirtualUserId = workspaceUser?.virtual_user_id ?? undefined;
    }

    if (!actorVirtualUserId && needsApprovalActor) {
      return NextResponse.json(
        { error: 'Failed to resolve actor virtual user ID' },
        { status: 500 }
      );
    }

    const typedSupabase = supabase as TypedSupabaseClient;
    const { data: transitionResultRaw, error: transitionError } =
      await typedSupabase.rpc(
        'update_workspace_configs_with_approval_transitions',
        {
          p_ws_id: wsId,
          p_updates: parsedUpdates,
          p_actor_virtual_user_id: actorVirtualUserId,
        }
      );

    if (transitionError) {
      console.error(
        'Error updating workspace configs with transitions:',
        transitionError
      );
      return NextResponse.json(
        { error: 'Failed to update workspace configs' },
        { status: 500 }
      );
    }

    const transitionResult =
      transitionResultRaw && typeof transitionResultRaw === 'object'
        ? (transitionResultRaw as {
            posts_auto_approved?: unknown;
            reports_auto_approved?: unknown;
          })
        : {};

    const postsAutoApproved =
      typeof transitionResult.posts_auto_approved === 'number' &&
      Number.isInteger(transitionResult.posts_auto_approved) &&
      transitionResult.posts_auto_approved >= 0
        ? transitionResult.posts_auto_approved
        : 0;

    const reportsAutoApproved =
      typeof transitionResult.reports_auto_approved === 'number' &&
      Number.isInteger(transitionResult.reports_auto_approved) &&
      transitionResult.reports_auto_approved >= 0
        ? transitionResult.reports_auto_approved
        : 0;

    const autoApproved: AutoApprovalSummary = {
      posts: postsAutoApproved,
      reports: reportsAutoApproved,
    };

    return NextResponse.json({
      message: 'success',
      auto_approved: autoApproved,
    });
  } catch (error) {
    console.error('Error in workspace configs API (PUT):', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
