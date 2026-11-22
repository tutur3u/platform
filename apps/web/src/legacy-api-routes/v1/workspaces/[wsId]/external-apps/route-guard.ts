import { limitExternalAppWorkspaceRequest } from '@/lib/external-apps/rate-limit';
import type { WorkspaceRouteGuard } from '@/legacy-api-routes/workspace-route-group';

/** Rate-limits every external-app workspace route once, before its handler. */
export const guard: WorkspaceRouteGuard = limitExternalAppWorkspaceRequest;
