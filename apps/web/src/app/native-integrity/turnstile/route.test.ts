// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('next/server', async (original) => ({
  ...(await original<object>()),
  connection: async () => {},
}));
vi.mock('@/lib/native-integrity/runtime', () => ({
  nativeIntegrityMode: () => process.env.NATIVE_INTEGRITY_MODE ?? 'off',
  nativeIntegrityTurnstileParents: () => [
    'https://tuturuuu.com',
    'https://mobile.example',
  ],
}));

import { GET } from './route';

beforeEach(() => {
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'monitor');
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'public-test-key');
});
afterEach(() => vi.unstubAllEnvs());
it('serves only exact request hashes with origin-locked bridge and strict CSP', async () => {
  const response = await GET(
    new NextRequest(
      `https://tuturuuu.com/native-integrity/turnstile?requestHash=${'h'.repeat(43)}&parentOrigin=https://tuturuuu.com`
    )
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-security-policy')).toContain(
    "default-src 'none'"
  );
  expect(response.headers.get('content-security-policy')).toContain(
    'frame-ancestors https://tuturuuu.com'
  );
  const html = await response.text();
  expect(html).toContain('window.__tuturuuuNativeIntegrityResult=result');
  expect(html).toContain("action:'native_integrity'");
  expect(html).toContain("retry:'never'");
  expect(html).toContain('window.parent.postMessage');
  expect(html).not.toContain('Bearer');
});
it('rejects malformed hash and unapproved parent origins, and is disabled in off mode', async () => {
  expect(
    (
      await GET(
        new NextRequest(
          'https://tuturuuu.com/native-integrity/turnstile?requestHash=invalid'
        )
      )
    ).status
  ).toBe(404);
  expect(
    (
      await GET(
        new NextRequest(
          `https://tuturuuu.com/native-integrity/turnstile?requestHash=${'h'.repeat(43)}&parentOrigin=https://evil.example`
        )
      )
    ).status
  ).toBe(400);
  vi.stubEnv('NATIVE_INTEGRITY_MODE', 'off');
  expect(
    (
      await GET(
        new NextRequest(
          `https://tuturuuu.com/native-integrity/turnstile?requestHash=${'h'.repeat(43)}`
        )
      )
    ).status
  ).toBe(404);
});
