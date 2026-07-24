import { createSatelliteWorkspaceAvatarRouteHandlers } from '@tuturuuu/satellite/workspace-settings-route-handlers';

const handlers = createSatelliteWorkspaceAvatarRouteHandlers('rewise');

export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
