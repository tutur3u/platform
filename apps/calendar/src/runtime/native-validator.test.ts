import { describe, expect, it } from 'vitest';
import {
  calendarPageInput,
  loadCalendarLocale,
  loadCalendarPage,
} from './page-loader';
import { addRealtimeLog, realtimeLogInput } from './realtime-log-actions';
import { fetchWorkspaces, workspaceReadInput } from './workspace-actions';

// Importing the actual ports also constructs the installed createServerFn builders.
describe('installed native builders and their real input schemas', () => {
  it('constructs the page, locale and realtime transports', () => {
    expect(typeof loadCalendarPage).toBe('function');
    expect(typeof loadCalendarLocale).toBe('function');
    expect(typeof addRealtimeLog).toBe('function');
    expect(typeof fetchWorkspaces).toBe('function');
  });
  it('accepts an internal page path and rejects external or malformed inputs', () => {
    expect(
      calendarPageInput.parse({ path: '/personal?date=2026-10-19' })
    ).toEqual({ path: '/personal?date=2026-10-19' });
    for (const input of [
      { path: '//foreign.test' },
      { path: 'https://foreign.test' },
      { path: 1 },
      {},
      { path: `/${'a'.repeat(8192)}` },
    ])
      expect(calendarPageInput.safeParse(input).success).toBe(false);
  });
  it('accepts an empty workspace read payload and rejects caller identity', () => {
    expect(workspaceReadInput.parse({})).toEqual({});
    for (const input of [
      undefined,
      null,
      { userId: 'caller' },
      { wsId: 'caller' },
    ])
      expect(workspaceReadInput.safeParse(input).success).toBe(false);
  });
  it('validates actor/workspace identities and bounded log fields before the supplier', () => {
    const valid = {
      wsId: '00000000-0000-4000-8000-000000000001',
      userId: null,
      kind: 'info',
      message: 'sample',
    };
    expect(realtimeLogInput.parse(valid)).toEqual(valid);
    for (const input of [
      { ...valid, wsId: 'wrong' },
      { ...valid, userId: 'wrong' },
      { ...valid, message: 'a'.repeat(4001) },
      { ...valid, kind: 'a'.repeat(129) },
    ])
      expect(realtimeLogInput.safeParse(input).success).toBe(false);
  });
});
