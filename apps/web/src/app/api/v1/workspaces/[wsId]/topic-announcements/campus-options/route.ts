import {
  getTutoringCampusChoices,
  readTutoringPolicyConfigRows,
  TUTORING_POLICY_CONFIG_ID,
} from '@tuturuuu/internal-api/tutoring-policy';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { resolveTopicAnnouncementsAccess } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

/**
 * Campus labels for the announcement place picker. Announcement managers may
 * lack `view_user_groups`, so this returns only the label projection of the
 * current workspace's tutoring policy, never the policy itself.
 */
export async function GET(request: Request, { params }: Params) {
  await connection();
  const { wsId } = await params;
  const access = await resolveTopicAnnouncementsAccess(request, wsId, {
    requireManage: true,
  });
  if (access.response) return access.response;

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('workspace_configs')
    .select('id,value')
    .eq('ws_id', access.context.normalizedWsId)
    .like('id', `${TUTORING_POLICY_CONFIG_ID}%`);
  if (error) {
    console.error('Failed to load topic announcement campus options', error);
    return NextResponse.json(
      { message: 'Failed to load campus options' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      data: getTutoringCampusChoices(readTutoringPolicyConfigRows(data ?? [])),
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
