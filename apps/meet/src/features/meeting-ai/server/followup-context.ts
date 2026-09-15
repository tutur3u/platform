import 'server-only';
import {
  getPermissions,
  resolveWorkspaceIdForPrincipal,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
import { MeetAiError, type MeetAiParams, meetAiAccess } from './access';

export async function followupAccess(
  request: Request,
  params: MeetAiParams,
  destination?: string
) {
  const access = await meetAiAccess(request, params);
  const { db, user } = access;
  let workspaceId = destination;
  if (workspaceId === undefined) {
    try {
      workspaceId = await resolveWorkspaceIdForPrincipal({
        authorizationClient: db,
        principal: { id: user.id, email: user.email ?? null },
        wsId: 'personal',
      });
    } catch (error) {
      throw new MeetAiError(
        error instanceof Error && error.name === 'WorkspaceNotFoundError'
          ? 404
          : 503,
        'Personal destination unavailable'
      );
    }
  }
  if (!workspaceId || !z.uuid().safeParse(workspaceId).success)
    throw new MeetAiError(400, 'Invalid destination');
  const member = await verifyWorkspaceMembershipType({
    supabase: db,
    userId: user.id,
    wsId: workspaceId,
    requiredType: 'MEMBER',
  });
  if (member.error === 'membership_lookup_failed')
    throw new MeetAiError(500, 'Destination access lookup failed');
  if (!member.ok) throw new MeetAiError(403, 'Destination access denied');
  const permissions = await getPermissions({ wsId: workspaceId, user });
  return { ...access, workspaceId, permissions };
}

export async function readFollowupContext(
  request: Request,
  params: MeetAiParams
) {
  const url = new URL(request.url);
  const access = await followupAccess(
    request,
    params,
    url.searchParams.get('workspaceId') ?? undefined
  );
  const { db, user, workspaceId } = access;
  if (url.searchParams.has('startAt') || url.searchParams.has('endAt')) {
    const range = z
      .object({ startAt: z.iso.datetime(), endAt: z.iso.datetime() })
      .safeParse({
        startAt: url.searchParams.get('startAt'),
        endAt: url.searchParams.get('endAt'),
      });
    if (
      !range.success ||
      Date.parse(range.data.startAt) >= Date.parse(range.data.endAt)
    )
      throw new MeetAiError(400, 'Invalid calendar interval');
    if (
      !access.permissions ||
      access.permissions.withoutPermission('manage_calendar')
    )
      throw new MeetAiError(403, 'Calendar access denied');
    const conflicts = await db
      .from('workspace_calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('ws_id', workspaceId)
      .lt('start_at', range.data.endAt)
      .gt('end_at', range.data.startAt);
    if (conflicts.error)
      throw new MeetAiError(503, 'Calendar availability unavailable');
    return { count: conflicts.count ?? 0 };
  }
  const boardId = url.searchParams.get('boardId');
  if (boardId && !z.uuid().safeParse(boardId).success)
    throw new MeetAiError(400, 'Invalid board');
  const [profile, preferences, memberships, boards] = await Promise.all([
    db.from('users').select('display_name').eq('id', user.id).maybeSingle(),
    db
      .from('user_private_details')
      .select('full_name, timezone')
      .eq('user_id', user.id)
      .maybeSingle(),
    db
      .from('workspace_members')
      .select('workspaces!inner(id, name, personal, deleted)')
      .eq('user_id', user.id)
      .eq('type', 'MEMBER'),
    db
      .from('workspace_boards')
      .select('id, name')
      .eq('ws_id', workspaceId)
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('created_at')
      .limit(200),
  ]);
  if (
    [profile, preferences, memberships, boards].some((result) => result.error)
  )
    throw new MeetAiError(503, 'Follow-up destinations unavailable');
  let lists: Array<{ id: string; name: string | null; status: string | null }> =
    [];
  if (boardId) {
    if (!boards.data?.some((board) => board.id === boardId))
      throw new MeetAiError(403, 'Board access denied');
    const result = await db
      .from('task_lists')
      .select('id, name, status')
      .eq('board_id', boardId)
      .eq('deleted', false)
      .eq('archived', false)
      .order('position')
      .limit(200);
    if (result.error) throw new MeetAiError(503, 'Task lists unavailable');
    lists = result.data;
  }
  return {
    user: {
      id: user.id,
      display_name: profile.data?.display_name ?? null,
      full_name: preferences.data?.full_name ?? null,
      email: user.email ?? null,
    },
    timezone: preferences.data?.timezone ?? 'auto',
    workspaceId,
    workspaces:
      memberships.data?.flatMap(({ workspaces: workspace }) =>
        workspace && !workspace.deleted
          ? [
              {
                id: workspace.id,
                name: workspace.name,
                personal: workspace.personal,
                access_type: 'member' as const,
              },
            ]
          : []
      ) ?? [],
    boards: boards.data ?? [],
    lists,
  };
}
