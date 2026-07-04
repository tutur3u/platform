import { type NextRequest, NextResponse } from 'next/server';

import { apiRouteLoaders } from './registry';
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
const routeEntries = Object.keys(apiRouteLoaders)
  .map((routeFile) => ({
    routeFile,
    segments: routeFile.split('/').slice(0, -1),
    score: scoreRoute(routeFile),
  }))
  .sort(
    (left, right) =>
      right.score - left.score ||
      right.segments.length - left.segments.length ||
      left.routeFile.localeCompare(right.routeFile)
  );

function scoreRoute(routeFile: string): number {
  return routeFile
    .split('/')
    .slice(0, -1)
    .reduce((score, segment) => {
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

function dynamicParamName(segment: string) {
  return segment.slice(1, -1);
}

function catchAllParamName(segment: string) {
  return segment.slice(4, -1);
}

function matchRoute(segments: string[]) {
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

export async function dispatchLegacyApiRoute(
  request: NextRequest,
  method: HttpMethod
) {
  const segments = requestApiSegments(request);

  if (!segments) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const match = matchRoute(segments);
  if (!match) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const loader =
    apiRouteLoaders[match.routeFile as keyof typeof apiRouteLoaders];
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
}
