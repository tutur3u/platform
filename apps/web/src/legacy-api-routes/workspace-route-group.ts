import type { NextRequest } from 'next/server';
import { createLegacyGetHandler, createLegacyHeadHandler } from './head';

const methods = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const;
type Method = (typeof methods)[number];
type LegacyHandler = (
  request: NextRequest,
  context: never
) => Response | undefined | Promise<Response | undefined>;
type Route = readonly [
  readonly string[],
  Partial<Record<Method, LegacyHandler>>,
];
type Context = {
  params: Promise<{ wsId: string; segments?: string[] }>;
};

/**
 * Runs once per matched request, before its handler. Returning a response
 * answers the request without calling the handler.
 */
export type WorkspaceRouteGuard = (
  request: NextRequest,
  route: { method: Method; pattern: readonly string[]; wsId: string }
) => Response | undefined | Promise<Response | undefined>;

export function createWorkspaceRouteHandlers(
  routes: readonly Route[],
  guard?: WorkspaceRouteGuard
) {
  // At a given depth, Next tries literal segments ahead of parameter segments.
  const ordered = [...routes]
    .sort(([left], [right]) => {
      for (
        let index = 0;
        index < Math.min(left.length, right.length);
        index++
      ) {
        const priority =
          Number(left[index]?.startsWith('[')) -
          Number(right[index]?.startsWith('['));
        if (priority) return priority;
      }
      return left.length - right.length;
    })
    .map(([pattern, source]) => {
      const handlers = { ...source };
      if (source.GET) {
        handlers.GET = createLegacyGetHandler(source.GET);
        handlers.HEAD ??= createLegacyHeadHandler(handlers.GET);
      }
      return { pattern, handlers };
    });

  function handler(method: Method) {
    return async (request: NextRequest, context: Context) => {
      const { wsId, segments = [] } = await context.params;
      // Match literals against the URL and pass only decoded parameters to
      // handlers, as the original concrete Next routes did.
      const baseMatch = /^\/api\/v1\/workspaces\/[^/]+\/[^/]+(?:\/(.*))?$/.exec(
        request.nextUrl.pathname.replace(/\/$/, '')
      );
      const pathSegments = baseMatch?.[1]?.split('/') ?? [];
      if (!baseMatch || pathSegments.length !== segments.length) {
        return new Response(null, { status: 404 });
      }
      for (const { pattern, handlers } of ordered) {
        if (
          pattern.length !== segments.length ||
          !pattern.every(
            (part, index) =>
              part.startsWith('[') || part === pathSegments[index]
          )
        ) {
          continue;
        }
        const run = handlers[method];
        if (run) {
          const refusal = await guard?.(request, { method, pattern, wsId });
          if (refusal) return refusal;
          const params = Object.fromEntries([
            ['wsId', wsId],
            ...pattern.flatMap((part, index) =>
              part.startsWith('[') ? [[part.slice(1, -1), segments[index]]] : []
            ),
          ]);
          // The generator pairs each source module with its original file path.
          return run(request, { params: Promise.resolve(params) } as never);
        }
        if (method === 'OPTIONS') {
          const allow = [...Object.keys(handlers), 'OPTIONS'].sort().join(', ');
          return new Response(null, { status: 204, headers: { Allow: allow } });
        }
        return new Response(null, { status: 405 });
      }
      return new Response(null, { status: 404 });
    };
  }

  return {
    GET: handler('GET'),
    HEAD: handler('HEAD'),
    POST: handler('POST'),
    PUT: handler('PUT'),
    PATCH: handler('PATCH'),
    DELETE: handler('DELETE'),
    OPTIONS: handler('OPTIONS'),
  };
}
