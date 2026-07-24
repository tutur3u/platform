import { createSatelliteWorkspaceAvatarRouteHandlers } from '@tuturuuu/satellite/workspace-settings-route-handlers';

const handlers = createSatelliteWorkspaceAvatarRouteHandlers('finance');

export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
