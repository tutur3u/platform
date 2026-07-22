import { createSatelliteWorkspaceRouteHandlers } from '@tuturuuu/satellite/workspace-settings-route-handlers';

const handlers = createSatelliteWorkspaceRouteHandlers('rewise');

export const GET = handlers.GET;
export const PUT = handlers.PUT;
