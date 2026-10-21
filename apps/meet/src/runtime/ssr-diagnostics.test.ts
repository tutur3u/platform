import { redirect } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  observeMeetSsr,
  parseMeetSsrRecord,
  projectMeetSsr,
  reportMeetSsr,
} from './ssr-diagnostics';

afterEach(() => vi.restoreAllMocks());
describe('closed Meet SSR observations', () => {
  it('preserves actual router redirect and normal error identities', async () => {
    const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const original of [
      redirect({ href: 'https://private.invalid/token' }),
      new Error('private-message'),
    ]) {
      await expect(
        observeMeetSsr('loader-model', () => {
          throw original;
        })
      ).rejects.toBe(original);
    }
    const records = sink.mock.calls.map(([line]) =>
      JSON.parse(String(line).split('meet-ssr-diagnostic ')[1]!)
    );
    expect(records.map((r) => [r.phase, r.outcome, r.kind])).toEqual([
      ['loader-model', 'threw', 'router-redirect'],
      ['loader-model', 'threw', 'error'],
    ]);
    expect(JSON.stringify(records)).not.toMatch(/private|token/);
  });
  it('observes import and model independently and preserves response identity', async () => {
    const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const [status, outcome] of [
      [500, 'returned500'],
      [307, 'returnedredirect'],
      [200, 'returnedother'],
    ] as const) {
      const response = new Response(null, { status });
      expect(await observeMeetSsr('handler', () => response)).toBe(response);
      expect(
        JSON.parse(
          String(sink.mock.calls.at(-1)?.[0]).split('meet-ssr-diagnostic ')[1]!
        ).outcome
      ).toBe(outcome);
    }
    const model = {};
    expect(await observeMeetSsr('loader-import', () => model)).toBe(model);
    expect(await observeMeetSsr('loader-model', () => model)).toBe(model);
    expect(sink.mock.calls.map(([s]) => String(s))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"phase":"loader-import"'),
        expect.stringContaining('"phase":"loader-model"'),
      ])
    );
  });
  it('does not invoke cause, message, stack or name accessors or serialize payloads', () => {
    const accessed = vi.fn(() => {
      throw new Error('SECRET');
    });
    const error = new Error();
    for (const key of ['cause', 'message', 'stack', 'name', 'code', 'toJSON'])
      Object.defineProperty(error, key, { get: accessed });
    const record = projectMeetSsr(error, 'render-boundary', 'threw');
    expect(record.kind).toBe('error');
    expect(record.inspection).toBe('unavailable');
    expect(accessed).not.toHaveBeenCalled();
    expect(JSON.stringify(record)).not.toContain('SECRET');
  });
  it('allows only four known frames and bounded locations, never raw paths', () => {
    const error = new TypeError('SECRET');
    Object.defineProperty(error, 'stack', {
      value:
        'SECRET\n' +
        Array.from(
          { length: 6 },
          () => ' at loadPageModel (/private/SECRET:12:3)'
        ).join('\n') +
        '\n at privateFunction (/SECRET:1:2)',
    });
    const record = projectMeetSsr(error, 'loader-model', 'threw');
    expect(record.frames).toEqual(
      Array.from({ length: 4 }, () => ({
        function: 'loadPageModel',
        line: 12,
        column: 3,
      }))
    );
    expect(record.inspection).toBe('overflow');
    expect(JSON.stringify(record)).not.toContain('SECRET');
  });
  it('reports hostile inspection unavailable and a throwing sink cannot mask primary', async () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw Error('SECRET');
        },
      }
    );
    expect(projectMeetSsr(hostile, 'handler', 'threw').kind).toBe('UNKNOWN');
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw Error('sink');
    });
    await expect(
      observeMeetSsr('handler', () => {
        throw hostile;
      })
    ).rejects.toBe(hostile);
    expect(() =>
      reportMeetSsr(hostile, 'render-boundary', 'threw')
    ).not.toThrow();
  });
  it('does not classify Response lookalike names or Location headers as router redirects', () => {
    expect(
      projectMeetSsr(
        { name: 'Redirect', headers: { Location: 'SECRET' } },
        'loader-model',
        'threw'
      ).kind
    ).toBe('other');
    expect(
      projectMeetSsr(
        new Response(null, { status: 307, headers: { Location: 'SECRET' } }),
        'loader-model',
        'threw'
      ).kind
    ).toBe('response-other');
  });
});

it('async rejection remains the same primary and returned response bodies stay unread', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const original = new Error('SECRET');
  await expect(
    observeMeetSsr('loader-import', async () => {
      throw original;
    })
  ).rejects.toBe(original);
  const response = new Response('SECRET');
  expect(await observeMeetSsr('handler', async () => response)).toBe(response);
  expect(response.bodyUsed).toBe(false);
  expect(await response.text()).toBe('SECRET');
});
it('throwing owning redirect inspection and parser getters cannot replace primary or escape', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const original = new Response(null, { status: 307 });
  Object.defineProperty(original, 'options', {
    get() {
      throw Error('SECRET');
    },
  });
  const record = projectMeetSsr(original, 'loader-model', 'threw');
  expect(record.kind).toBe('UNKNOWN');
  expect(record.inspection).toBe('unavailable');
  await expect(
    observeMeetSsr('loader-model', () => {
      throw original;
    })
  ).rejects.toBe(original);
  expect(
    parseMeetSsrRecord({
      get version() {
        throw Error('SECRET');
      },
    })
  ).toBeUndefined();
});
it('emission is bounded per instance with explicit overflow, not silent success', async () => {
  vi.resetModules();
  const { reportMeetSsr: freshReport } = await import('./ssr-diagnostics');
  const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
  for (let i = 0; i < 70; i++) freshReport(null, 'handler', 'returnedother');
  expect(sink).toHaveBeenCalledTimes(65);
  expect(sink.mock.calls.at(-1)?.[0]).toBe(
    'meet-ssr-diagnostic {"version":1,"overflow":true}'
  );
});
