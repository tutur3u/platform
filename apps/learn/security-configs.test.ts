import { describe, expect, it } from 'vitest';
import learn from '../learn/start-bridge.config';
import nova from '../nova/start-bridge.config';
import tools from '../tools/start-bridge.config';
import teach from '../teach/start-bridge.config';
import finance from '../finance/start-bridge.config';
import drive from '../drive/start-bridge.config';
import chat from '../chat/start-bridge.config';
import cms from '../cms/start-bridge.config';
import forms from '../forms/start-bridge.config';
import git from '../git/start-bridge.config';
import ai from '../ai/start-bridge.config';
const configs = {
  learn,
  nova,
  tools,
  teach,
  finance,
  drive,
  chat,
  cms,
  forms,
  git,
  ai,
};
describe.each(Object.entries(configs))('%s app wiring', (app, config) => {
  for (const basePath of [
    '',
    `/${app}`,
    ...(app === 'learn' || app === 'teach' ? [`/lms/${app}`] : []),
  ]) {
    it.each(['report', 'enforce'])(
      'selects %s for ' + (basePath || 'subdomain'),
      async (mode) => {
        const request = new Request(
          `https://${basePath ? 'tuturuuu.com' : `${app}.tuturuuu.com`}${basePath}/page`
        );
        const response = new Response('<p>page</p>', {
          headers: { 'Content-Type': 'text/html' },
        });
        response.headers.set(
          'Content-Security-Policy',
          config.csp!('test', { request, response, path: '/page' })!
        );
        const secured = await config.wrapResponse!(response, {
          request,
          env: {
            ASSETS: { fetch: async () => new Response() },
            ABUSE_GUARD: { fetch: async () => new Response() },
            [`TTR_TRUSTED_TYPES_${app.toUpperCase()}`]: mode,
          },
          mounts: {
            rootHosts: [`${app}.tuturuuu.com`],
            mountHosts: ['tuturuuu.com'],
            basePath: basePath || `/${app}`,
          },
        });
        const csp = secured.headers.get('Content-Security-Policy');
        expect(csp).toContain("'nonce-test' 'strict-dynamic'");
        expect(csp?.includes('require-trusted-types-for')).toBe(
          mode === 'enforce'
        );
        const target = secured.headers.get(
          mode === 'enforce'
            ? 'Content-Security-Policy'
            : 'Content-Security-Policy-Report-Only'
        );
        expect(target).toContain('trusted-types default dompurify');
        expect(target).toContain(`report-uri ${basePath}/api/csp-report`);
        if (app === 'learn') expect(target).toContain('editorViewLayer');
      }
    );
  }
});
