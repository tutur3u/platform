import { createSatelliteWorkspaceRouteHandlers } from '@tuturuuu/satellite/workspace-settings-route-handlers';

const handlers = createSatelliteWorkspaceRouteHandlers('inventory');

export const GET = handlers.GET;
export const PUT = handlers.PUT;
