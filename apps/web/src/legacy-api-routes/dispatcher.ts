import { type NextRequest, NextResponse } from 'next/server';

import { apiRouteLoaders } from './registry';
import { v1RouteLoaders } from './registry/v1';
import type { LegacyApiRouteModule, LegacyApiRouteParams } from './types';

type HttpMethod =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS';

const API_ROUTE_PREFIX = '/api/';

type RouteEntry = {
  routeFile: string;
  score: number;
  segments: string[];
};

type LegacyApiDispatcherOptions = {
  requestPrefixSegments?: string[];
  routeFilePrefixSegments?: string[];
};

function scoreRoute(segments: string[]): number {
  return segments.reduce((score, segment) => {
    if (isCatchAllSegment(segment)) return score;
    if (isDynamicSegment(segment)) return score + 2;
    return score + 4;
  }, 0);
}

function isDynamicSegment(segment: string) {
  return /^\[[^\]]+\]$/u.test(segment);
}

function isCatchAllSegment(segment: string) {
  return /^\[\.\.\.[^\]]+\]$/u.test(segment);
}

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function requestApiSegments(request: NextRequest) {
  const pathname = new URL(request.url).pathname;

  if (pathname === '/api') return [];
  if (!pathname.startsWith(API_ROUTE_PREFIX)) return null;

  return pathname
    .slice(API_ROUTE_PREFIX.length)
    .split('/')
    .filter(Boolean)
    .map(decodePathSegment);
}

function startsWithSegments(segments: string[], prefix: string[]) {
  return prefix.every((segment, index) => segments[index] === segment);
}

function stripSegmentPrefix(segments: string[], prefix: string[]) {
  if (prefix.length === 0) return segments;
  if (!startsWithSegments(segments, prefix)) return null;
  return segments.slice(prefix.length);
}

function createRouteEntries(
  routeLoaders: Record<string, unknown>,
  routeFilePrefixSegments: string[]
): RouteEntry[] {
  return Object.keys(routeLoaders)
    .map((routeFile) => {
      const rawSegments = routeFile.split('/').slice(0, -1);
      const segments =
        stripSegmentPrefix(rawSegments, routeFilePrefixSegments) ?? rawSegments;

      return {
        routeFile,
        score: scoreRoute(segments),
        segments,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.segments.length - left.segments.length ||
        left.routeFile.localeCompare(right.routeFile)
    );
}

function dynamicParamName(segment: string) {
  return segment.slice(1, -1);
}

function catchAllParamName(segment: string) {
  return segment.slice(4, -1);
}

function matchRoute(segments: string[], routeEntries: RouteEntry[]) {
  for (const route of routeEntries) {
    const params: LegacyApiRouteParams = {};
    let requestIndex = 0;
    let matched = true;

    for (const routeSegment of route.segments) {
      if (isCatchAllSegment(routeSegment)) {
        const remaining = segments.slice(requestIndex);
        if (remaining.length === 0) {
          matched = false;
          break;
        }
        params[catchAllParamName(routeSegment)] = remaining;
        requestIndex = segments.length;
        break;
      }

      const requestSegment = segments[requestIndex];
      if (!requestSegment) {
        matched = false;
        break;
      }

      if (isDynamicSegment(routeSegment)) {
        params[dynamicParamName(routeSegment)] = requestSegment;
        requestIndex += 1;
        continue;
      }

      if (routeSegment !== requestSegment) {
        matched = false;
        break;
      }

      requestIndex += 1;
    }

    if (matched && requestIndex === segments.length) {
      return { params, routeFile: route.routeFile };
    }
  }

  return null;
}

function supportedMethods(routeModule: LegacyApiRouteModule) {
  return ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].filter(
    (method) => typeof routeModule[method] === 'function'
  );
}

export function createLegacyApiDispatcher(
  routeLoaders: Record<string, () => Promise<unknown>>,
  options: LegacyApiDispatcherOptions = {}
) {
  const requestPrefixSegments = options.requestPrefixSegments ?? [];
  const routeEntries = createRouteEntries(
    routeLoaders,
    options.routeFilePrefixSegments ?? []
  );

  return async function dispatchLegacyApiRoute(
    request: NextRequest,
    method: HttpMethod
  ) {
    const segments = requestApiSegments(request);

    if (!segments) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const scopedSegments = stripSegmentPrefix(segments, requestPrefixSegments);
    if (!scopedSegments) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const match = matchRoute(scopedSegments, routeEntries);
    if (!match) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const loader = routeLoaders[match.routeFile];
    if (!loader) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const routeModule = (await loader()) as LegacyApiRouteModule;
    const handler =
      routeModule[method] ?? (method === 'HEAD' ? routeModule.GET : undefined);

    if (typeof handler !== 'function') {
      return new NextResponse(null, {
        headers: { Allow: supportedMethods(routeModule).join(', ') },
        status: 405,
      });
    }

    const response = await handler(request, {
      params: Promise.resolve(match.params),
    });

    if (method === 'HEAD' && !routeModule.HEAD) {
      return new Response(null, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    }

    return response;
  };
}

export const dispatchLegacyApiRoute =
  createLegacyApiDispatcher(apiRouteLoaders);

export const dispatchLegacyV1ApiRoute = createLegacyApiDispatcher(
  v1RouteLoaders,
  {
    requestPrefixSegments: ['v1'],
    routeFilePrefixSegments: ['v1'],
  }
);
