import 'server-only';
import { authorizeMiraOperator, miraJson } from './authorize';
import {
  type MiraOperatorAction,
  runMiraOperatorAction,
} from './operator-service';

type RouteContext = { params?: Promise<{ wsId?: string }> };

/** Route handler factory for /api/v1/infrastructure/mira/**. */
export function miraOperatorRoute(action: MiraOperatorAction) {
  return async (request: Request, context?: RouteContext) => {
    const isWrite = action === 'tenant_stop' || action === 'global_stop_set';
    const authorization = await authorizeMiraOperator(request, {
      write: isWrite,
    });
    if (!authorization.ok) return authorization.response;
    const result = await runMiraOperatorAction(
      {
        rpc: authorization.rpc,
        // Analytics Engine metrics arrive with the channel Worker.
        loadMetrics: async () => ({ status: 'unavailable' }),
      },
      {
        action,
        actorId: authorization.actorId,
        body: isWrite ? await request.json().catch(() => null) : undefined,
        wsId: (await context?.params)?.wsId,
        searchParams: new URL(request.url).searchParams,
      }
    );
    return miraJson(result.body, result.status);
  };
}
