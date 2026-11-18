// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import policies from '../../packages/utils/src/seo-policy.json';
import { PRIVATE_ROBOTS_HEADER } from '../../packages/utils/src/seo-robots';
import {
  deploymentProfile,
  PROFILE_ENV,
} from './cloudflare/deployment-profile.mjs';
import marketing from './start-bridge.config';

const MARKER = 'x-marketing-origin-robots';
const voidConfig = readFileSync(
  new URL('./void.config.ts', import.meta.url),
  'utf8'
);
const production = deploymentProfile('production', {});
const staging = deploymentProfile('staging', {});

async function respond(host: string, path: string, vars: object) {
  const response = await marketing.wrapResponse!(
    new Response('<html></html>', {
      headers: { 'content-type': 'text/html' },
    }),
    {
      request: new Request(`https://${host}${path}`),
      env: vars,
      seoPolicy: policies.marketing,
    }
  );
  return response.headers;
}

describe('marketing production Worker indexing', () => {
  it('builds the production Worker without the staging noindex flag', () => {
    expect(production.name).toBe('tuturuuu-marketing');
    expect(production.vars.TUTURUUU_NOINDEX).not.toBe('1');
    expect(production.workersDev).toBe(false);
    expect(() =>
      deploymentProfile('production', { TUTURUUU_NOINDEX: '1' })
    ).toThrow(/TUTURUUU_NOINDEX/u);
    expect(() => deploymentProfile('prod', {})).toThrow(/Unknown/u);
    expect(() => deploymentProfile('', {})).toThrow(/Unknown/u);
  });

  it('keeps the default staging candidate separate and noindex', () => {
    expect(deploymentProfile(undefined, {})).toEqual(staging);
    expect(staging.name).toBe('tuturuuu-marketing-vite-staging');
    expect(staging.name).not.toBe(production.name);
    expect(staging.vars.TUTURUUU_NOINDEX).toBe('1');
  });

  it('wires the Worker identity and vars through the profile', () => {
    expect(PROFILE_ENV).toBe('VITE_MARKETING_NATIVE_PROFILE');
    expect(voidConfig).toMatch(
      /const profile = deploymentProfile\(process\.env\[PROFILE_ENV\]\);/u
    );
    expect(voidConfig).toMatch(/name: profile\.name,/u);
    expect(voidConfig).toMatch(/vars: profile\.vars,/u);
    // A regenerated staging-only template must fail here.
    expect(voidConfig).not.toMatch(/TUTURUUU_NOINDEX:/u);
    expect(voidConfig).not.toMatch(/name: ['"]/u);
  });

  describe.each(['/', '/vi', '/pricing', '/vi/pricing', '/about'])(
    '%s',
    (path) => {
      it('is indexable on tuturuuu.com with the production vars', async () => {
        const headers = await respond('tuturuuu.com', path, production.vars);
        expect(headers.get('x-robots-tag')).toBeNull();
        expect(headers.has(MARKER)).toBe(false);
      });

      it('marks the origin-only restriction for the gateway to release', async () => {
        const headers = await respond(
          'marketing.tuturuuu.com',
          path,
          production.vars
        );
        expect(headers.get('x-robots-tag')).toBe(PRIVATE_ROBOTS_HEADER);
        expect(headers.get(MARKER)).toBe('1');
      });

      it('stays noindex without the marker under the staging vars', async () => {
        for (const host of ['tuturuuu.com', 'marketing.tuturuuu.com']) {
          const headers = await respond(host, path, staging.vars);
          expect(headers.get('x-robots-tag')).toBe(PRIVATE_ROBOTS_HEADER);
          expect(headers.has(MARKER)).toBe(false);
        }
      });
    }
  );
});
