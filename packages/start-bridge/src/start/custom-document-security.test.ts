import { describe, expect, it, vi } from 'vitest';
import { requestNonce } from '../core/csp';

vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({
    fetch: async () =>
      new Response(`<script nonce="${requestNonce()}"></script>`, {
        headers: { 'Content-Type': 'text/html' },
      }),
  }),
}));
vi.mock('../../../../apps/apps/src/native/api.server', () => ({
  apiRequest: () => Response.json({ ok: true }),
}));

import appsWorker from '../../../../apps/apps/cloudflare/worker';
import lmsWorker from '../../../../apps/lms/cloudflare/worker';

const env = {
  ASSETS: { fetch: async () => new Response('asset') },
  APPS_CANONICAL_HOST_ENABLED: '1',
};

describe.each(['report', 'enforce'])('custom renderers %s', (mode) => {
  it.each(['https://apps.tuturuuu.com/', 'https://tuturuuu.com/apps/'])(
    'secures Apps at %s',
    async (url) => {
      const response = await appsWorker.fetch(new Request(url), {
        ...env,
        TTR_TRUSTED_TYPES_APPS: mode,
      });
      const csp = response.headers.get('Content-Security-Policy') ?? '';
      expect(csp).toContain("'strict-dynamic'");
      expect(csp.includes('require-trusted-types-for')).toBe(
        mode === 'enforce'
      );
      const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce).toBeTruthy();
      expect(await response.text()).toContain(`nonce="${nonce}"`);
      const target = response.headers.get(
        mode === 'enforce'
          ? 'Content-Security-Policy'
          : 'Content-Security-Policy-Report-Only'
      );
      expect(target).toContain('trusted-types default dompurify');
      expect(target).toContain(
        `report-uri ${new URL(url).hostname === 'tuturuuu.com' ? '/apps' : ''}/api/csp-report`
      );
    }
  );

  it('secures the LMS launcher; the subdomain is not admitted', async () => {
    const response = await lmsWorker.fetch(
      new Request('https://tuturuuu.com/lms'),
      {
        ...env,
        TTR_TRUSTED_TYPES_LMS: mode,
      }
    );
    const csp = response.headers.get('Content-Security-Policy') ?? '';
    expect(csp.includes('require-trusted-types-for')).toBe(mode === 'enforce');
    expect(csp).toContain("'strict-dynamic'");
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(await response.text()).toContain(`nonce="${nonce}"`);
    expect(
      (await lmsWorker.fetch(new Request('https://lms.tuturuuu.com/'), env))
        .status
    ).toBe(404);
  });
});
