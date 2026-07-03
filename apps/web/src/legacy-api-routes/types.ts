import type { NextRequest } from 'next/server';

export type LegacyApiRouteParams = Record<string, string | string[]>;
export type LegacyApiRouteContext = {
  params: Promise<LegacyApiRouteParams>;
};
export type LegacyApiRouteResponse = Response | Promise<Response>;
export type LegacyApiRouteHandler = (
  request: NextRequest,
  context: LegacyApiRouteContext
) => LegacyApiRouteResponse;
export type LegacyApiRouteModule = Partial<
  Record<string, LegacyApiRouteHandler>
>;
export type LegacyApiRouteLoader = () => Promise<unknown>;
export type LegacyApiRouteLoaderMap = Record<string, LegacyApiRouteLoader>;
