import { createSatelliteWorkspaceRouteHandlers } from '@tuturuuu/satellite/workspace-settings-route-handlers';

import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

const handlers = createSatelliteWorkspaceRouteHandlers('infra');

export async function GET(
  request: Request,
  context: Parameters<typeof handlers.GET>[1]
) {
  const auth = await authorizeInfrastructureAdminRequest(
    'view_infrastructure',
    true,
    request
  );
  if (!auth.ok) return auth.response;

  return handlers.GET(request, context);
}
export const PUT = handlers.PUT;
