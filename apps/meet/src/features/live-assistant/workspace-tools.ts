import 'server-only';
import { createMeetWorkspaceTools } from '@tuturuuu/ai/meetings/workspace-tools';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';
import { MeetCallAccessError } from '../call/lib/call-access';
import type { callRoomService } from '../call/server/room-service';

type Access = Parameters<typeof callRoomService>[0];
export async function liveWorkspaceTools(
  access: Access,
  workspaceId: string,
  timezone: string
) {
  const supabase = await createAdminClient({ noCookie: true });
  const membership = await verifyWorkspaceMembershipType({
    supabase,
    userId: access.user.id,
    wsId: workspaceId,
    requiredType: 'MEMBER',
  });
  if (!membership.ok)
    throw new MeetCallAccessError(403, 'Workspace access denied');
  const permissions = await getPermissions({
    wsId: workspaceId,
    user: access.user,
  });
  return createMeetWorkspaceTools(
    { supabase, userId: access.user.id, wsId: workspaceId, timezone },
    permissions?.withoutPermission ?? (() => true)
  );
}
export async function liveWorkspaceCatalog(
  access: Access,
  workspaceId: string,
  timezone: string
) {
  const tools = await liveWorkspaceTools(access, workspaceId, timezone);
  return Object.entries(tools).flatMap(([name, tool]) => {
    if (!(tool.inputSchema instanceof z.ZodType)) return [];
    return [
      {
        name: `workspace_${name}`,
        description: `${tool.description ?? name} Requires private requester approval before execution.`,
        parametersJsonSchema: z.toJSONSchema(tool.inputSchema, {
          unrepresentable: 'any',
        }),
      },
    ];
  });
}
