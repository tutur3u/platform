import { expect, it } from 'vitest';
import { applyMeetDocumentHeaders } from './security-profile';

it("adds 'wasm-unsafe-eval' to Meet's script-src and nothing broader", () => {
  const response = applyMeetDocumentHeaders(
    new Request('https://tuturuuu.com/meet/r/abc'),
    new Response('<!doctype html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
    {}
  );
  const csp = response.headers.get('content-security-policy-report-only') ?? '';
  const script = csp.split('; ').find((part) => part.startsWith('script-src '));
  expect(script).toContain("'wasm-unsafe-eval'");
  expect(script).not.toContain("'unsafe-eval'");
  expect(script).not.toContain("'unsafe-inline'");
  expect(csp).not.toContain("'unsafe-eval'");
});

it('adds no host to script-src or connect-src: formatter code is same-origin', () => {
  const response = applyMeetDocumentHeaders(
    new Request('https://tuturuuu.com/meet/r/abc'),
    new Response('<!doctype html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
      MEET_REALTIME_URL: 'https://meet-realtime.tuturuuu.com',
    }
  );
  const csp = response.headers.get('content-security-policy-report-only') ?? '';
  const directive = (name: string) =>
    csp.split('; ').find((part) => part.startsWith(`${name} `));
  // Exactly the self sources plus the one keyword; no CDN or other host.
  expect(directive('script-src')).toBe(
    "script-src https://tuturuuu.com/meet/ https://tuturuuu.com/api/ 'wasm-unsafe-eval'"
  );
  // Exactly the connect hosts that existed before the WebAssembly change.
  expect(directive('connect-src')).toBe(
    'connect-src https://tuturuuu.com/meet/ https://tuturuuu.com/api/ https://abc.supabase.co wss://abc.supabase.co https://meet-realtime.tuturuuu.com https://rtc.live.cloudflare.com'
  );
  expect(directive('worker-src')).not.toMatch(/https:\/\/(?!tuturuuu\.com)/u);
});
