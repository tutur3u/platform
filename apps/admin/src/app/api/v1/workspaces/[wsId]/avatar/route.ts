import { createSatelliteWorkspaceAvatarRouteHandlers } from '@tuturuuu/satellite/workspace-settings-route-handlers';

const handlers = createSatelliteWorkspaceAvatarRouteHandlers('infra');

export const DELETE = handlers.DELETE;
export const PATCH = handlers.PATCH;
