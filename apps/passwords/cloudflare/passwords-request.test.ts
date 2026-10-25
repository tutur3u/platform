import { describe, expect, it, vi } from 'vitest';
import type { PasswordsEnvironment } from '../src/service/environment';
import {
  type PasswordsRequestDependencies,
  passwordsRequest,
} from './passwords-request';

function setup(enabled: string | undefined) {
  const asset = vi.fn(async () => new Response('asset'));
  const env = {
    ASSETS: { fetch: asset },
    PASSWORDS_ENABLED: enabled,
  } as unknown as PasswordsEnvironment;
  const edgeHandle = vi.fn(async () => null);
  const service = vi.fn(() => ({}) as never);
  const deps = {
    buildInfo: (request: Request) =>
      new URL(request.url).pathname === '/api/build-info'
        ? Response.json({ app: 'passwords' })
        : null,
    createRuntime: vi.fn(() => ({
      secrets: { handle: async () => null },
      edge: { handle: edgeHandle },
      service,
    })),
    renderPage: vi.fn(async () => new Response('page')),
    withContext: vi.fn((_context, work) => work()),
  } satisfies PasswordsRequestDependencies;
  const call = (path: string, method = 'GET') =>
    passwordsRequest(
      new Request(`https://passwords.test${path}`, { method }),
      env,
      deps
    );
  return { call, deps, edgeHandle, service, asset };
}

describe('passwordsRequest stop fence', () => {
  it.each([undefined, '', 'false', 'TRUE', '1'])(
    'refuses with 503 before building the runtime when PASSWORDS_ENABLED is %j',
    async (value) => {
      const { call, deps, edgeHandle, service } = setup(value);
      for (const [path, method] of [
        ['/en/personal', 'GET'],
        ['/_passwords/functions/revealItem', 'POST'],
        ['/api/auth/verify-app-token', 'POST'],
        ['/api/v1/secrets/operation', 'POST'],
        ['/api/v1/secrets/oidc/exchange', 'POST'],
        ['/api/v1/secrets/credentials', 'POST'],
      ] as const) {
        const response = await call(path, method);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ code: 'STOPPED' });
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      }
      expect(deps.createRuntime).not.toHaveBeenCalled();
      expect(edgeHandle).not.toHaveBeenCalled();
      expect(service).not.toHaveBeenCalled();
      expect(deps.renderPage).not.toHaveBeenCalled();
    }
  );

  it('still serves static files and build identity while stopped', async () => {
    const { call, asset, deps } = setup('false');
    expect(await (await call('/assets/app.js')).text()).toBe('asset');
    expect((await call('/api/build-info')).status).toBe(200);
    expect(asset).toHaveBeenCalledTimes(1);
    expect(deps.createRuntime).not.toHaveBeenCalled();
  });

  it('does not exempt a static-looking path for a non-GET request', async () => {
    const { call, asset } = setup('false');
    expect((await call('/assets/x', 'POST')).status).toBe(503);
    expect(asset).not.toHaveBeenCalled();
  });

  it('renders through the runtime only when enabled', async () => {
    const { call, deps, service, edgeHandle } = setup('true');
    const response = await call('/en/personal');
    expect(await response.text()).toBe('page');
    expect(deps.createRuntime).toHaveBeenCalledTimes(1);
    expect(edgeHandle).toHaveBeenCalledTimes(1);
    expect(service).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });
});
