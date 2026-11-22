// @vitest-environment node
import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import productionVars from '../../cloudflare/production-profile.json';

const runtime = vi.hoisted(() => {
  vi.stubEnv('VITE_DRIVE_NATIVE_PROFILE', 'production');
  return {
    start: vi.fn(async () => new Response('Drive')),
    loadModule: vi.fn(async () => ({ endpoints: [] })),
  };
});
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: runtime.start }),
}));
vi.mock('../../cloudflare/required-bindings', () => ({
  missingRequiredBindings: () => false,
}));
vi.mock('../proxy', () => ({
  proxy: async () => NextResponse.next(),
  config: { matcher: ['/(.*)'] },
}));
vi.mock('@tuturuuu/start-bridge/function-proxy', () => ({
  createFunctionProxy: () => async () => NextResponse.next(),
}));
import worker from '../../cloudflare/worker';
import { stagingVars } from './staging-policy';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Drive production mount environment gate', () => {
  it('accepts production bindings on both production hosts', async () => {
    vi.stubGlobal('__driveTestRsc', { loadModule: runtime.loadModule });
    const env = {
      ...productionVars,
      ASSETS: { fetch: async () => new Response('asset') },
    };
    for (const url of [
      'https://drive.tuturuuu.com/workspace',
      'https://tuturuuu.com/drive/workspace',
    ]) {
      const response = await worker.fetch(new Request(url), env, {
        waitUntil: vi.fn(),
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('Drive');
    }
  });
  it.each([
    'https://fixture.supabase.co',
    'https://drive-production-fixture.invalid',
    'https://nzamlzqfdwaaxdefwraj.supabase.co.evil.invalid',
  ])(
    'rejects the unpinned Supabase origin %s on both hosts',
    async (origin) => {
      vi.stubGlobal('__driveTestRsc', { loadModule: runtime.loadModule });
      const env = {
        ...productionVars,
        NEXT_PUBLIC_SUPABASE_URL: origin,
        ASSETS: { fetch: async () => new Response('asset') },
      };
      for (const url of [
        'https://drive.tuturuuu.com/workspace',
        'https://tuturuuu.com/drive/workspace',
      ]) {
        const response = await worker.fetch(new Request(url), env, {
          waitUntil: vi.fn(),
        });
        expect(response.status).toBe(503);
      }
    }
  );
  it('rejects staging bindings on the production mount', async () => {
    const response = await worker.fetch(
      new Request('https://tuturuuu.com/drive/workspace'),
      { ...stagingVars, ASSETS: { fetch: async () => new Response('asset') } },
      { waitUntil: vi.fn() }
    );
    expect(response.status).toBe(503);
  });
});
