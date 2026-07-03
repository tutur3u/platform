import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  dryRun: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(5000).optional().default(500),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type BackfillRow = {
  audit_record_version_id: number;
  user_id: string;
  ws_id: string;
  archived: boolean;
  archived_until: string | null;
  actor_auth_uid: string | null;
  creator_id: string | null;
  source: 'live' | 'backfilled';
  created_at: string;
  event_kind: string;
};

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;
  const permissions = await getPermissions({ wsId, request: req });

  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!permissions.containsPermission('manage_workspace_audit_logs')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const parsedBody = BodySchema.safeParse(await req.json().catch(() => ({})));

  if (!parsedBody.success) {
    return NextResponse.json(
      { message: 'Invalid backfill payload' },
      { status: 400 }
    );
  }

  try {
    const sbAdmin = await createAdminClient();
    const rpc = sbAdmin.rpc.bind(sbAdmin) as unknown as <T>(
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: T[] | null; error: Error | null }>;
    const { data, error } = await rpc<BackfillRow>(
      'backfill_workspace_user_status_changes',
      {
        p_ws_id: wsId,
        p_dry_run: parsedBody.data.dryRun,
        p_limit: parsedBody.data.limit,
      }
    );

    if (error) {
      throw error;
    }

    return NextResponse.json({
      rows: data ?? [],
      count: data?.length ?? 0,
      dryRun: parsedBody.data.dryRun,
    });
  } catch (error) {
    console.error('Error backfilling workspace user status changes:', error);

    return NextResponse.json(
      { message: 'Error backfilling workspace user status changes' },
      { status: 500 }
    );
  }
}
