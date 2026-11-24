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
