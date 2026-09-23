import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
describe('required MFA browser navigation', () => {
  it('reloads the current route once when simultaneous requests require verification', async () => {
    const reload = vi.fn();
    vi.stubGlobal('window', {
      location: { pathname: '/workspace/tasks', reload },
    });
    const { parseInternalApiError } = await import('./internal-api-error');
    const response = () =>
      Response.json(
        { code: 'MFA_REQUIRED', error: 'MFA verification required' },
        { status: 403 }
      );
    expect(await parseInternalApiError(response())).toMatchObject({
      status: 403,
      code: 'MFA_REQUIRED',
    });
    await parseInternalApiError(response());
    expect(reload).toHaveBeenCalledOnce();
  });
  it.each(['/login', '/vi/login'])(
    'does not reload the verification surface %s',
    async (pathname) => {
      const reload = vi.fn();
      vi.stubGlobal('window', { location: { pathname, reload } });
      const { parseInternalApiError } = await import('./internal-api-error');
      await parseInternalApiError(
        Response.json({ code: 'MFA_REQUIRED' }, { status: 403 })
      );
      expect(reload).not.toHaveBeenCalled();
    }
  );
  it('does not navigate for temporary assurance lookup failures', async () => {
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/workspace', reload } });
    const { parseInternalApiError } = await import('./internal-api-error');
    await parseInternalApiError(
      Response.json({ code: 'AUTH_UNAVAILABLE' }, { status: 503 })
    );
    expect(reload).not.toHaveBeenCalled();
  });
});
