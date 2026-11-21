import 'server-only';
import { z } from 'zod';
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
    const wsId = (await context?.params)?.wsId;
    // A malformed id is refused before authorization. A dotted segment also
    // skips the proxy matcher, so it must never reach a session lookup.
    if (wsId !== undefined && !z.guid().safeParse(wsId).success) {
      return miraJson({ error: 'invalid_request' }, 400);
    }
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
        wsId,
        searchParams: new URL(request.url).searchParams,
      }
    );
    return miraJson(result.body, result.status);
  };
}
