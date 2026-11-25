import { createSatelliteWorkspaceAvatarRouteHandlers } from '@tuturuuu/satellite/workspace-settings-route-handlers';

const handlers = createSatelliteWorkspaceAvatarRouteHandlers('whiteboards');

export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
