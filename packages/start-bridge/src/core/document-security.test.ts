import { describe, expect, it, vi } from 'vitest';
import { defaultContentSecurityPolicy } from './csp';
import {
  collectDocumentSecurityReport,
  secureBridgeDocument,
} from './document-security';

const apps = [
  'tasks',
  'learn',
  'nova',
  'tools',
  'teach',
  'lms',
  'finance',
  'drive',
  'chat',
  'cms',
  'forms',
  'git',
  'ai',
  'apps',
];
const html = () =>
  new Response('<script nonce="test"></script>', {
    headers: {
      'Content-Type': 'text/html',
      'Content-Security-Policy': defaultContentSecurityPolicy('test'),
    },
  });

describe.each(apps)('%s document security', (app) => {
  for (const basePath of ['', `/${app}`]) {
    it.each([undefined, 'report', 'enforce', 'ENFORCE'])(
      'stages %s at ' + (basePath || 'subdomain'),
      (mode) => {
        const request = new Request(
          `https://${basePath ? 'tuturuuu.com' : `${app}.tuturuuu.com`}${basePath}/page`
        );
        const result = secureBridgeDocument(html(), {
          request,
          env: { [`TTR_TRUSTED_TYPES_${app.toUpperCase()}`]: mode },
          app,
          basePath,
          policies: ['dompurify'],
        });
        const csp = result.headers.get('Content-Security-Policy');
        expect(csp).toContain("script-src 'nonce-test' 'strict-dynamic'");
        const target = result.headers.get(
          mode === 'enforce'
            ? 'Content-Security-Policy'
            : 'Content-Security-Policy-Report-Only'
        );
        expect(target).toContain(
          "require-trusted-types-for 'script'; trusted-types default dompurify"
        );
        expect(target).toContain(`report-uri ${basePath}/api/csp-report`);
        expect(csp?.includes('require-trusted-types-for')).toBe(
          mode === 'enforce'
        );
      }
    );
  }
});

it('leaves upstream API HTML and non-HTML alone', () => {
  for (const response of [html(), Response.json({ ok: true })]) {
    expect(
      secureBridgeDocument(response, {
        request: new Request('https://tuturuuu.com/tools/api/x'),
        env: {},
        app: 'tools',
        basePath: '/tools',
      })
    ).toBe(response);
  }
});

it('collects without logging URLs, samples, or arbitrary directives', async () => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const response = await collectDocumentSecurityReport(
    new Request('https://tuturuuu.com/tools/api/csp-report', {
      method: 'POST',
      body: JSON.stringify({
        'csp-report': {
          'effective-directive': 'trusted-types',
          disposition: 'enforce',
          'document-uri': 'private',
          'script-sample': 'private',
        },
      }),
    })
  );
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  expect(log).toHaveBeenCalledWith('document security violation', {
    directive: 'trusted-types',
    disposition: 'enforce',
  });
  log.mockRestore();
});

it('bounds chunked bodies and refuses non-POST methods', async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(17 * 1024));
    },
    cancel,
  });
  expect(
    (
      await collectDocumentSecurityReport(
        new Request('https://tools.tuturuuu.com/api/csp-report', {
          method: 'POST',
          body,
          duplex: 'half',
        } as RequestInit)
      )
    ).status
  ).toBe(204);
  expect(cancel).toHaveBeenCalledOnce();
  expect(
    (
      await collectDocumentSecurityReport(
        new Request('https://tools.tuturuuu.com/api/csp-report')
      )
    ).status
  ).toBe(405);
});
