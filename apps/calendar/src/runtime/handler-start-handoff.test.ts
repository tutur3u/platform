import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarTelemetryPort } from './request-telemetry.server';

const suppliers = vi.hoisted(() => ({
  start: vi.fn<(request: Request) => Promise<Response>>(),
  proxy: vi.fn(),
}));
vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: suppliers.start },
}));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('../proxy', () => ({ proxy: suppliers.proxy }));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: async () => null,
}));

import { handleCalendarRequest } from './handler';

const env = {
  ASSETS: {
    fetch: async () => {
      throw new Error('Start handoff must not fetch assets');
    },
  },
};
const ctx = { waitUntil: (work: Promise<unknown>) => void work };
const telemetry: CalendarTelemetryPort = {
  setActor: () => {},
  cron: async (_options, handler) => handler(),
};
const rawBody = '{ "revision": 7, "consent": true }';
const rawQuery = '?cursor=a%2Bb&x=1&x=2';
function mutation(path: string) {
  return new Request(`https://calendar.tuturuuu.com${path}${rawQuery}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'app=one; refresh=two',
      origin: 'https://calendar.tuturuuu.com',
    },
    body: rawBody,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
});

describe('actual Calendar handler to Start handoff', () => {
  it('passes a native JSON mutation once and preserves supplier failure identity', async () => {
    const request = mutation('/_calendar/functions/fixture');
    const failure = new Error('unconfirmed Start write');
    suppliers.start.mockImplementationOnce(async (forwarded) => {
      expect(forwarded.url).toBe(request.url);
      expect(forwarded.method).toBe('POST');
      expect(new URL(forwarded.url).search).toBe(rawQuery);
      expect(forwarded.headers.get('cookie')).toBe('app=one; refresh=two');
      expect(forwarded.bodyUsed).toBe(false);
      expect(await forwarded.text()).toBe(rawBody);
      expect(forwarded.bodyUsed).toBe(true);
      await expect(forwarded.text()).rejects.toThrow();
      throw failure;
    });
    await expect(
      handleCalendarRequest(request, env, ctx, telemetry)
    ).rejects.toBe(failure);
    expect(suppliers.start).toHaveBeenCalledTimes(1);
    expect(suppliers.proxy).not.toHaveBeenCalled();
  });

  it('keeps the original URL after real middleware rewriting while retaining refreshed headers and body', async () => {
    const request = mutation('/personal');
    suppliers.proxy.mockResolvedValueOnce(
      NextResponse.rewrite(
        'https://calendar.tuturuuu.com/vi/personal?view=day',
        {
          request: {
            headers: new Headers({
              'content-type': 'application/json',
              cookie: 'app=rotated; refresh=two',
              'x-next-intl-locale': 'vi',
            }),
          },
        }
      )
    );
    suppliers.start.mockImplementationOnce(async (forwarded) => {
      expect(forwarded.url).toBe(request.url);
      expect(new URL(forwarded.url).search).toBe(rawQuery);
      expect(forwarded.method).toBe('POST');
      expect(forwarded.headers.get('cookie')).toBe('app=rotated; refresh=two');
      expect(forwarded.headers.get('x-next-intl-locale')).toBe('vi');
      expect(await forwarded.text()).toBe(rawBody);
      return new Response('Start accepted bytes', { status: 207 });
    });
    const response = await handleCalendarRequest(request, env, ctx, telemetry);
    expect(response.status).toBe(207);
    expect(await response.text()).toBe('Start accepted bytes');
    expect(suppliers.start).toHaveBeenCalledTimes(1);
    expect(suppliers.proxy).toHaveBeenCalledTimes(1);
  });
});

it('captures a sanitized owning failure without replacing its identity', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = new TypeError('PRIVATE_SENTINEL never log this');
  suppliers.start.mockRejectedValueOnce(failure);
  suppliers.proxy.mockResolvedValueOnce(NextResponse.next());
  try {
    await expect(
      handleCalendarRequest(
        new Request('https://calendar.test/verify-token'),
        env,
        ctx,
        telemetry
      )
    ).rejects.toBe(failure);
    expect(log).toHaveBeenCalledWith('calendar-ssr-error category=TYPE_ERROR');
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_SENTINEL');
  } finally {
    log.mockRestore();
  }
});

it('captures real asynchronous response-policy rejection after successful asset dispatch', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failure = new TypeError('PRIVATE_POLICY_SENTINEL');
  let headerReads = 0;
  class PolicyFailureResponse extends Response {
    override get headers(): Headers {
      headerReads += 1;
      throw failure;
    }
  }
  const fetchAsset = vi.fn(async () => new PolicyFailureResponse('asset'));
  try {
    await expect(
      handleCalendarRequest(
        new Request('https://calendar.test/assets/fixture.js'),
        { ASSETS: { fetch: fetchAsset } },
        ctx,
        telemetry
      )
    ).rejects.toBe(failure);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(headerReads).toBe(1);
    expect(suppliers.start).not.toHaveBeenCalled();
    expect(suppliers.proxy).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([
      ['calendar-ssr-error category=TYPE_ERROR'],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      'PRIVATE_POLICY_SENTINEL'
    );
  } finally {
    log.mockRestore();
  }
});

it('retains a returned 500 body and security policy without inventing an owning exception', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  suppliers.proxy.mockResolvedValueOnce(NextResponse.next());
  suppliers.start.mockResolvedValueOnce(
    new Response('upstream failed', {
      status: 500,
      headers: { 'content-type': 'text/html', 'x-owner': 'calendar' },
    })
  );
  try {
    const response = await handleCalendarRequest(
      new Request('https://calendar.test/verify-token'),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('upstream failed');
    expect(response.headers.get('x-owner')).toBe('calendar');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'"
    );
    expect(suppliers.start).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
