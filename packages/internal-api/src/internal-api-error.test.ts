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

describe('duplicate citation recovery', () => {
  const id = 'c4f7f9d2-5b72-4a02-8867-39850ec60c44';

  it('carries a valid authorized duplicate id for source reuse', async () => {
    const { parseInternalApiError } = await import('./internal-api-error');
    expect(
      await parseInternalApiError(
        Response.json(
          { code: 'DUPLICATE_SOURCE', existingId: id },
          { status: 409 }
        )
      )
    ).toMatchObject({ code: 'DUPLICATE_SOURCE', existingId: id });
  });

  it.each([
    [409, 'DUPLICATE_SOURCE', '/other-workspace/item'],
    [409, 'VERSION_CONFLICT', id],
    [403, 'DUPLICATE_SOURCE', id],
  ])(
    'ignores unrelated or malformed recovery ids',
    async (status, code, existingId) => {
      const { parseInternalApiError } = await import('./internal-api-error');
      expect(
        (
          await parseInternalApiError(
            Response.json({ code, existingId }, { status })
          )
        ).existingId
      ).toBeUndefined();
    }
  );
});

describe('retry hints', () => {
  const respond = (body: unknown, headers: HeadersInit = {}, status = 429) =>
    new Response(JSON.stringify(body), { status, headers });

  it('carries the Retry-After header as retryAfter seconds', async () => {
    const { parseInternalApiError } = await import('./internal-api-error');
    expect(
      await parseInternalApiError(
        respond({ message: 'Limit' }, { 'Retry-After': '1800' })
      )
    ).toMatchObject({ status: 429, message: 'Limit', retryAfter: 1800 });
  });
  it('falls back to a retryAfter body field and keeps the code', async () => {
    const { parseInternalApiError } = await import('./internal-api-error');
    expect(
      await parseInternalApiError(
        respond({
          message: 'Limit',
          code: 'PROFILE_UPLOAD_LIMIT',
          retryAfter: 90,
        })
      )
    ).toMatchObject({ code: 'PROFILE_UPLOAD_LIMIT', retryAfter: 90 });
  });
  it('ignores missing or non-numeric retry hints', async () => {
    const { parseInternalApiError } = await import('./internal-api-error');
    expect(
      (await parseInternalApiError(respond({}, {}, 503))).retryAfter
    ).toBeUndefined();
    expect(
      (
        await parseInternalApiError(
          respond({}, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' })
        )
      ).retryAfter
    ).toBeUndefined();
  });
});
