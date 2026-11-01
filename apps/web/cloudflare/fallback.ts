import {
  type ForwardOptions,
  forwardToCentralApi,
  HOP_BY_HOP_HEADERS,
} from '@tuturuuu/start-bridge/api-forward';
import { createOriginClientIpProof } from '@tuturuuu/utils/abuse-protection/origin-ip-proof';
import { stagingProfile } from './profile';
import {
  sanitizedSearch,
  sanitizeForwardHeaders,
  sanitizeUpstreamResponseHeaders,
} from './request-sanitizer';

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
  bypassSecret: string,
  fetcher: Fetcher
) {
  const ip = request.headers.get('cf-connecting-ip') ?? '';
  const proof = createOriginClientIpProof({ ip, secret });
  if (!proof) return new Response('Missing trusted client IP', { status: 400 });
  const headers = new Headers(request.headers);
  stripConnectionHeaders(headers);
  sanitizeForwardHeaders(headers);
  headers.set('x-tuturuuu-origin-auth', proof);
  headers.set('x-forwarded-for', ip);
  headers.set('x-real-ip', ip);
  headers.set('x-forwarded-host', stagingProfile.host);
  headers.set('x-forwarded-proto', 'https');
  // Deployment Protection bypass for the admitted origin only. The Worker
  // never asks Vercel to set a bypass cookie, so no `_vercel_jwt` is minted.
  headers.set('x-vercel-protection-bypass', bypassSecret);
  const forwarded = new Request(request, { headers });
  const upstream = await forwardToCentralApi(forwarded, origin, {
    search: sanitizedSearch(new URL(request.url)),
    fetcher: async (input, init) => {
      const response = await fetcher(input, init);
      const headers = new Headers(response.headers);
      stripConnectionHeaders(headers);
      sanitizeUpstreamResponseHeaders(headers);
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
    // Staging cookies are host-only: any Domain attribute, whatever its value
    // (including an empty or repeated one), widens or obscures the scope.
    if (/;\s*domain\s*=/iu.test(cookie)) {
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
