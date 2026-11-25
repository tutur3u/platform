import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyExchangeOutcome,
  logExchangeOutcome,
  logExchangeResponse,
  sanitizeExchangeAppId,
} from './exchange-outcome-log';

afterEach(() => vi.restoreAllMocks());

describe('sanitizeExchangeAppId', () => {
  it('lower-cases and keeps [a-z0-9._-]', () => {
    expect(sanitizeExchangeAppId('CyberShield35')).toBe('cybershield35');
    expect(sanitizeExchangeAppId('a.b_c-d')).toBe('a.b_c-d');
  });

  it('caps at 64 chars', () => {
    expect(sanitizeExchangeAppId('a'.repeat(100))).toBe('a'.repeat(64));
  });

  it.each([undefined, null, 5, '', 'a b', 'a/b', 'a@b.com', 'é', 'a\nb'])(
    'logs %j as invalid',
    (value) => {
      expect(sanitizeExchangeAppId(value)).toBe('invalid');
    }
  );
});

describe('classifyExchangeOutcome', () => {
  const classify = (
    status: number,
    extra: { code?: unknown; error?: unknown; refresh?: boolean } = {}
  ) => classifyExchangeOutcome({ refresh: false, status, ...extra });

  it('maps statuses and refusal bodies to the fixed enum', () => {
    expect(classify(200)).toBe('ok');
    expect(classify(200, { refresh: true })).toBe('refresh-ok');
    expect(classify(400, { code: 'WORKSPACE_ID_REQUIRED' })).toBe(
      'workspace-id-required'
    );
    expect(classify(400, { code: 'PKCE_REQUIRED' })).toBe('bad-request');
    expect(classify(400)).toBe('bad-request');
    expect(
      classify(401, { error: 'Workspace-bound sign-in required' })
    ).toBe('strict-binding-refused');
    expect(classify(401, { error: 'Invalid or expired token' })).toBe(
      'unauthorized'
    );
    expect(classify(403)).toBe('forbidden');
    expect(classify(429)).toBe('error');
    expect(classify(503)).toBe('error');
  });
});

describe('logExchangeOutcome', () => {
  it('logs exactly four fields with the severity of the outcome', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const context = { appId: 'App-1', refresh: true };

    logExchangeOutcome(context, 'refresh-ok', 200);
    logExchangeOutcome(context, 'forbidden', 403);
    logExchangeOutcome(context, 'error', 503);

    expect(info).toHaveBeenCalledWith('[app-token-exchange]', {
      appId: 'app-1',
      outcome: 'refresh-ok',
      refresh: true,
      status: 200,
    });
    expect(warn).toHaveBeenCalledWith('[app-token-exchange]', {
      appId: 'app-1',
      outcome: 'forbidden',
      refresh: true,
      status: 403,
    });
    expect(error).toHaveBeenCalledWith('[app-token-exchange]', {
      appId: 'app-1',
      outcome: 'error',
      refresh: true,
      status: 503,
    });
    expect(Object.keys(warn.mock.calls[0]?.[1] as object).sort()).toEqual([
      'appId',
      'outcome',
      'refresh',
      'status',
    ]);
  });
});

describe('logExchangeResponse', () => {
  it('classifies from the status and body code without consuming the response', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = Response.json(
      { code: 'WORKSPACE_ID_REQUIRED', error: 'x' },
      { status: 400 }
    );

    await logExchangeResponse({ appId: 'drive-app', refresh: false }, response);

    expect(warn).toHaveBeenCalledWith('[app-token-exchange]', {
      appId: 'drive-app',
      outcome: 'workspace-id-required',
      refresh: false,
      status: 400,
    });
    expect(await response.json()).toMatchObject({ error: 'x' });
  });

  it('never reads or logs a success body', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const response = Response.json({ accessToken: 'secret-token' });

    await logExchangeResponse({ appId: 'drive-app', refresh: false }, response);

    expect(JSON.stringify(info.mock.calls)).not.toContain('secret-token');
    expect(info).toHaveBeenCalledWith(
      '[app-token-exchange]',
      expect.objectContaining({ outcome: 'ok', status: 200 })
    );
  });
});
