import type { ApiEnv } from './contracts';
import { ApiError } from './errors';

const hopHeaders = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];
export const FORWARD_HOP = 'x-tuturuuu-api-forwarded';

export async function forwardToRetainedOrigin(
  request: Request,
  env: ApiEnv,
  signal: AbortSignal,
  fetcher: (request: Request) => Promise<Response>
): Promise<Response> {
  if (request.headers.has(FORWARD_HOP))
    throw new ApiError('unavailable', 503, 'Forwarding loop');
  let origin: URL;
  try {
    origin = new URL(env.RETAINED_API_ORIGIN ?? '');
  } catch {
    throw new ApiError('unavailable', 503, 'Retained origin is not configured');
  }
  const incoming = new URL(request.url);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.host === incoming.host ||
    origin.hostname === 'tuturuuu.com' ||
    origin.hostname.endsWith('.tuturuuu.com')
  ) {
    throw new ApiError(
      'unavailable',
      503,
      'Retained origin must bypass public routing'
    );
  }
  const target = new URL(incoming.pathname + incoming.search, origin);
  const headers = new Headers(request.headers);
  for (const header of (headers.get('connection') ?? '').split(',')) {
    if (header.trim()) headers.delete(header.trim());
  }
  for (const name of [
    ...hopHeaders,
    'host',
    'forwarded',
    'x-real-ip',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'cf-connecting-ip',
  ])
    headers.delete(name);
  for (const name of [...headers.keys()]) {
    if (
      [
        'x-tuturuuu-actor',
        'x-tuturuuu-app-base',
        'x-tuturuuu-proxy-not-found',
      ].includes(name) ||
      name.startsWith('x-tuturuuu-verified-') ||
      name.startsWith('x-middleware-')
    )
      headers.delete(name);
  }
  headers.set(FORWARD_HOP, '1');
  // Manual redirects preserve the legacy Location and never replay a write.
  const init: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
    signal,
    duplex: 'half',
  };
  return fetcher(new Request(target, init));
}
