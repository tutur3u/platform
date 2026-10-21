// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CALENDAR_SSR_MARKER,
  parseCalendarSsrErrorRecord,
  projectCalendarSsrError,
} from './ssr-diagnostics';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const sentinel = 'PRIVATE_SENTINEL_COOKIE_TOKEN_ENV_URL';
describe('bounded owning SSR error projection', () => {
  it('retains allowlisted categories/functions/locations but never text or paths', () => {
    const error = Object.assign(new TypeError(sentinel), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
    error.stack = `TypeError: ${sentinel}\n at loadPageModel (https://${sentinel}/secret.ts:12:34)\n at ${sentinel} (/raw/env:1:2)`;
    const record = projectCalendarSsrError(error, 'handler');
    expect(record).toEqual({
      version: 1,
      phase: 'handler',
      name: 'TypeError',
      code: 'ERR_MODULE_NOT_FOUND',
      category: 'MODULE_RESOLUTION',
      frames: [{ function: 'loadPageModel', line: 12, column: 34 }],
    });
    expect(JSON.stringify(record)).not.toContain(sentinel);
    expect(parseCalendarSsrErrorRecord(record)).toEqual(record);
  });
  it('uses UNKNOWN for unsupported names/codes and rejects forged/extra data', () => {
    const record = projectCalendarSsrError(
      { name: sentinel, code: sentinel, message: sentinel, stack: sentinel },
      'render-boundary'
    );
    expect(record.name).toBe('UNKNOWN');
    expect(record.code).toBe('UNKNOWN');
    expect(record.category).toBe('UNKNOWN');
    expect(record.frames).toEqual([]);
    expect(
      parseCalendarSsrErrorRecord({ ...record, message: sentinel })
    ).toBeUndefined();
    expect(
      parseCalendarSsrErrorRecord({ ...record, name: sentinel })
    ).toBeUndefined();
    expect(
      parseCalendarSsrErrorRecord({
        ...record,
        frames: [{ function: sentinel, line: 1, column: 2 }],
      })
    ).toBeUndefined();
  });
  it('bounds stack parsing and handles hostile accessors without throwing', () => {
    const error = new Error(sentinel);
    error.stack = `Error: ${sentinel}\n${' at getLocale (/secret:1:2)\n'.repeat(1000)}`;
    expect(projectCalendarSsrError(error, 'handler').frames).toHaveLength(4);
    expect(
      projectCalendarSsrError(
        {
          get name() {
            throw error;
          },
        },
        'handler'
      ).category
    ).toBe('UNKNOWN');
    expect(
      projectCalendarSsrError(
        { stack: `Error\n at getLocale (/secret:999999999:2)` },
        'handler'
      ).frames
    ).toEqual([]);
  });
  it('keeps default logs category-only, fixture detail bounded, and logging faults inert', async () => {
    vi.resetModules();
    const { reportCalendarSsrError } = await import('./ssr-diagnostics');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportCalendarSsrError(new TypeError(sentinel), 'handler');
    expect(log.mock.calls).toEqual([
      ['calendar-ssr-error category=TYPE_ERROR'],
    ]);
    vi.stubEnv('CALENDAR_SSR_DIAGNOSTICS', 'fixture-v1');
    for (let index = 0; index < 100; index += 1)
      reportCalendarSsrError(new TypeError(sentinel), 'render-boundary');
    expect(log.mock.calls.length).toBeLessThanOrEqual(32);
    expect(
      log.mock.calls.some(
        ([line]) =>
          typeof line === 'string' && line.startsWith(CALENDAR_SSR_MARKER)
      )
    ).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
    vi.resetModules();
    const fresh = await import('./ssr-diagnostics');
    log.mockImplementation(() => {
      throw new Error(sentinel);
    });
    expect(() =>
      fresh.reportCalendarSsrError(new Error(sentinel), 'handler')
    ).not.toThrow();
  });
});

it.each([
  null,
  { function: 'getLocale', line: 1, column: 2, message: sentinel },
  ...[-1, Number.NaN, Number.POSITIVE_INFINITY, 1000001].flatMap((value) => [
    { function: 'getLocale', line: value, column: 2 },
    { function: 'getLocale', line: 1, column: value },
  ]),
])(
  'rejects malformed frame metadata without accepting private fields: %j',
  (frame) => {
    const record = projectCalendarSsrError(new TypeError(sentinel), 'handler');
    expect(
      parseCalendarSsrErrorRecord({ ...record, frames: [frame] })
    ).toBeUndefined();
  }
);
