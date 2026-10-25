import type { Endpoint, RequestContext, RouteDefinition } from './contracts';
import { ApiError } from './errors';

export function defineRoute<Input, Output>(
  definition: RouteDefinition<Input, Output>
): Endpoint {
  return {
    ...definition,
    runtime: 'worker',
    async execute(input: unknown, context: RequestContext) {
      const parsed = definition.input.safeParse(input);
      if (!parsed.success)
        throw new ApiError('bad_request', 400, 'Invalid request parameters');
      const result = await definition.handle(parsed.data, context);
      const output = definition.output.safeParse(result);
      if (!output.success)
        throw new ApiError('invalid_output', 500, 'Invalid response');
      return Response.json(output.data, {
        status: definition.status,
        headers: { 'cache-control': 'no-store' },
      });
    },
  };
}

export function validateRegistry(endpoints: readonly Endpoint[]): void {
  const operationIds = new Set<string>();
  const paths = new Set<string>();
  for (const endpoint of endpoints) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9]+$/.test(endpoint.operationId) ||
      operationIds.has(endpoint.operationId)
    ) {
      throw new Error('Missing or duplicate operationId');
    }
    operationIds.add(endpoint.operationId);
    if (!endpoint.policy || endpoint.policy.kind === 'deny')
      throw new Error('Missing serving policy');
    if (!endpoint.input || !endpoint.output)
      throw new Error('Missing route schema');
    if (
      endpoint.limits.bodyBytes < 0 ||
      endpoint.limits.deadlineMs <= 0 ||
      endpoint.limits.deadlineMs > 30_000 ||
      !endpoint.limits.ratePolicy
    ) {
      throw new Error('Missing or unbounded route limits');
    }
    if (
      endpoint.guard === 'metadata' &&
      !['getHealth', 'getBuildInfo', 'getMobileVersion'].includes(
        endpoint.operationId
      )
    ) {
      throw new Error(
        'Only foundation metadata operations may bypass the Web guard adapter'
      );
    }
    if (
      endpoint.guard === 'metadata' &&
      (endpoint.policy.kind !== 'public' ||
        endpoint.method !== 'GET' ||
        endpoint.aliases.length > 0 ||
        !['/api/health', '/api/build-info', '/api/v1/mobile/version'].includes(
          endpoint.path
        ))
    ) {
      throw new Error('Invalid foundation metadata exemption');
    }
    for (const path of [
      endpoint.path,
      ...endpoint.aliases.map((alias) => alias.path),
    ]) {
      if (
        !/^\/api\/(?:[a-zA-Z0-9_-]+|\{[a-zA-Z][a-zA-Z0-9]*\})(?:\/(?:[a-zA-Z0-9_-]+|\{[a-zA-Z][a-zA-Z0-9]*\}))*$/.test(
          path
        )
      ) {
        throw new Error(`Invalid route pattern: ${path}`);
      }
      const key = `${endpoint.method} ${path.replace(/\{[^}]+\}/g, '{}')}`;
      if (paths.has(key)) throw new Error(`Duplicate route: ${key}`);
      paths.add(key);
    }
  }
}

export function matchPath(
  pattern: string,
  pathname: string
): Record<string, string> | null {
  const expected = pattern.split('/');
  const actual = pathname.split('/');
  const catchAll = expected.at(-1)?.startsWith('{...') ?? false;
  if (!catchAll && expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index++) {
    const token = expected[index];
    const value = actual[index];
    if (token?.startsWith('{...')) {
      const optional = token.endsWith('?}');
      if (actual.length < expected.length && !optional) return null;
      params[token.slice(4, optional ? -2 : -1)] = actual
        .slice(index)
        .map(decodeURIComponent)
        .join('/');
      return params;
    }
    if (token === undefined || value === undefined || (!value && index > 0))
      return null;
    if (token.startsWith('{'))
      params[token.slice(1, -1)] = decodeURIComponent(value);
    else if (token !== value) return null;
  }
  return params;
}
