import { createSatelliteWorkspaceRouteHandlers } from '@tuturuuu/satellite/workspace-settings-route-handlers';

const handlers = createSatelliteWorkspaceRouteHandlers('forms');

export const GET = handlers.GET;
export const PUT = handlers.PUT;
