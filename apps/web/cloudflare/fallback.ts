import {
  type ForwardOptions,
  forwardToCentralApi,
  HOP_BY_HOP_HEADERS,
} from '@tuturuuu/start-bridge/api-forward';
import { createOriginClientIpProof } from '@tuturuuu/utils/abuse-protection/origin-ip-proof';
import { stagingProfile } from './profile';

export type Fetcher = NonNullable<ForwardOptions['fetcher']>;

export function stripConnectionHeaders(headers: Headers) {
  const nominated = (headers.get('connection') ?? '').split(',');
  for (const name of [...HOP_BY_HOP_HEADERS, ...nominated]) {
    if (name.trim()) headers.delete(name.trim());
  }
}

export async function proxyNext(
  request: Request,
  origin: string,
  secret: string,
  fetcher: Fetcher
) {
  const ip = request.headers.get('cf-connecting-ip') ?? '';
  const proof = createOriginClientIpProof({ ip, secret });
  if (!proof) return new Response('Missing trusted client IP', { status: 400 });
  const headers = new Headers(request.headers);
  stripConnectionHeaders(headers);
  for (const name of [...headers.keys()]) {
    if (
      ['forwarded', 'true-client-ip', 'cf-connecting-ip'].includes(name) ||
      name.startsWith('x-vercel-')
    )
      headers.delete(name);
  }
  headers.set('x-tuturuuu-origin-auth', proof);
  headers.set('x-forwarded-for', ip);
  headers.set('x-real-ip', ip);
  headers.set('x-forwarded-host', stagingProfile.host);
  headers.set('x-forwarded-proto', 'https');
  const forwarded = new Request(request, { headers });
  const upstream = await forwardToCentralApi(forwarded, origin, {
    fetcher: async (input, init) => {
      const response = await fetcher(input, init);
      const headers = new Headers(response.headers);
      stripConnectionHeaders(headers);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  });
  // The candidate must never silently authenticate against a production DB.
  // A separately admitted Next staging origin must attest its configured ref.
  if (
    upstream.headers.get(stagingProfile.upstreamProjectHeader) !==
    stagingProfile.supabaseRef
  ) {
    await upstream.body?.cancel();
    return new Response('Upstream staging identity unavailable', {
      status: 502,
    });
  }
  for (const cookie of upstream.headers.getSetCookie()) {
    const domain = /;\s*domain\s*=\s*([^;]+)/iu.exec(cookie)?.[1];
    if (domain && domain.toLowerCase() !== stagingProfile.cookieDomain) {
      await upstream.body?.cancel();
      return new Response('Upstream cookie domain rejected', { status: 502 });
    }
  }
  const output = new Headers(upstream.headers);
  stripConnectionHeaders(output);
  output.delete(stagingProfile.upstreamProjectHeader);
  const location = output.get('location');
  if (location) {
    const resolved = new URL(location, origin);
    if (resolved.origin === origin) {
      output.set(
        'location',
        `https://${stagingProfile.host}${resolved.pathname}${resolved.search}${resolved.hash}`
      );
    }
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: output,
  });
}
