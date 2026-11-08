import { getUserGroupMembershipsForActor } from '../../../lib/user-groups/groups-utils';
import { resolveRequestActorAuthUid } from '../../../lib/user-groups/route-helpers';

export async function getReportReadGroupIds({
  request,
  wsId,
  canManageUsers,
}: {
  request: Request;
  wsId: string;
  canManageUsers: boolean;
}): Promise<string[] | null> {
  if (canManageUsers) return null;
  const actorAuthUid = await resolveRequestActorAuthUid(request);
  return actorAuthUid
    ? getUserGroupMembershipsForActor(wsId, actorAuthUid)
    : [];
}
