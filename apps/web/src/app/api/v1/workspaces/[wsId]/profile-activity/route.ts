import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getActivitySharing,
  getSharedActivity,
  listSharedProfiles,
  ProfileActivityUnavailable,
} from '@/lib/profile/workspace-activity';

const querySchema = z.object({
  userId: z.guid().optional(),
  after: z.guid().optional(),
  timezone: z
    .string()
    .max(100)
    .default('UTC')
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
});
const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const json = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers });
  try {
    const supabase = await createClient(req);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);
    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(req.url).searchParams)
    );
    if (!parsed.success) return json({ error: 'Invalid query' }, 400);
    const wsId = await normalizeWorkspaceId((await params).wsId, supabase);
    const access = await verifyWorkspaceMembershipType({
      supabase,
      wsId,
      userId: user.id,
    });
    if (access.error === 'membership_lookup_failed')
      return json({ error: 'Could not verify access' }, 500);
    if (!access.ok) return json({ error: 'Workspace access denied' }, 403);
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('personal')
      .eq('id', wsId)
      .maybeSingle();
    if (error) throw error;
    if (!workspace || workspace.personal)
      return json({ error: 'Workspace sharing unavailable' }, 403);
    const admin = await createAdminClient();
    const { userId, timezone, after } = parsed.data;
    if (userId)
      return json({
        stats: await getSharedActivity(admin, wsId, userId, timezone),
      });
    const sharing = await getActivitySharing(admin, wsId, user.id);
    return json({ sharing, ...(await listSharedProfiles(admin, wsId, after)) });
  } catch (error) {
    if (error instanceof ProfileActivityUnavailable)
      return json({ error: 'Shared activity unavailable' }, 404);
    console.error('Could not load workspace profile activity', error);
    return json({ error: 'Could not load workspace activity' }, 500);
  }
}
