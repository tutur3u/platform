import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import { executeCalendarAutomation } from './calendar-automation';

const api = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
  update: vi.fn(),
  sync: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/calendar', () => ({
  previewWorkspaceCalendarSchedule: api.preview,
  applyWorkspaceCalendarSchedule: api.apply,
  updateWorkspaceCalendarEvent: api.update,
  createWorkspaceCalendarEvent: api.create,
  deleteWorkspaceCalendarEvent: api.remove,
  getGoogleCalendarAuthUrl: vi.fn(),
  listCalendarConnections: vi.fn(),
  listWorkspaceSchedulableTasks: vi.fn(),
  syncWorkspaceCalendar: api.sync,
  getWorkspaceCalendarSyncStatus: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/client', () => ({
  withForwardedInternalApiAuth: (_headers: unknown, options: unknown) =>
    options,
}));
const context = () =>
  ({
    wsId: 'workspace',
    userId: 'user',
    timezone: 'Asia/Ho_Chi_Minh',
    requestHeaders: new Headers(),
  }) as unknown as MiraToolContext;
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());
describe('Calendar automation', () => {
  it('requires a successful same-window preview before safe apply', async () => {
    const ctx = context();
    expect(
      await executeCalendarAutomation(
        'apply_calendar_schedule',
        { windowDays: 7 },
        ctx
      )
    ).toHaveProperty('error');
    expect(api.apply).not.toHaveBeenCalled();
    api.preview.mockResolvedValue({
      success: true,
      preview: { events: [], summary: {} },
    });
    await executeCalendarAutomation(
      'preview_calendar_schedule',
      { windowDays: 7 },
      ctx
    );
    expect(
      await executeCalendarAutomation(
        'apply_calendar_schedule',
        { windowDays: 14 },
        ctx
      )
    ).toHaveProperty('error');
    await executeCalendarAutomation(
      'apply_calendar_schedule',
      { windowDays: 7 },
      ctx
    );
    expect(api.apply).toHaveBeenCalledWith(
      'workspace',
      expect.objectContaining({
        mode: 'safe-apply',
        forceReschedule: false,
        clientTimezone: 'Asia/Ho_Chi_Minh',
      }),
      expect.anything()
    );
    expect(
      await executeCalendarAutomation(
        'apply_calendar_schedule',
        { windowDays: 7 },
        ctx
      )
    ).toHaveProperty('error');
  });
  it('does not unlock application after a failed preview', async () => {
    const ctx = context();
    api.preview.mockResolvedValue({ success: false });
    await executeCalendarAutomation('preview_calendar_schedule', {}, ctx);
    await executeCalendarAutomation('apply_calendar_schedule', {}, ctx);
    expect(api.apply).not.toHaveBeenCalled();
  });
  it('uses the current workspace and forwards lock changes through the Calendar API', async () => {
    await executeCalendarAutomation(
      'set_event_locked',
      { eventId: 'event', locked: true },
      context()
    );
    expect(api.update).toHaveBeenCalledWith(
      'workspace',
      'event',
      { locked: true },
      expect.objectContaining({ baseUrl: expect.stringContaining('calendar.') })
    );
  });
  it('surfaces provider failures without retries and requires session auth', async () => {
    api.sync.mockRejectedValue(new Error('Reconnect Google'));
    expect(
      await executeCalendarAutomation(
        'sync_calendar',
        { direction: 'both' },
        context()
      )
    ).toEqual({ success: false, error: 'Reconnect Google' });
    expect(api.sync).toHaveBeenCalledTimes(1);
    expect(
      await executeCalendarAutomation(
        'sync_calendar',
        {},
        { ...context(), requestHeaders: undefined }
      )
    ).toHaveProperty('error');
    expect(api.sync).toHaveBeenCalledTimes(1);
  });
});

it('routes event creation to the selected provider and returns its saved receipt', async () => {
  api.create.mockResolvedValue({ id: 'saved-event' });
  const source = { provider: 'google', connectionId: 'connection' };
  const result = await executeCalendarAutomation(
    'create_event',
    {
      title: 'Planning',
      startAt: '2026-09-14T09:00:00+07:00',
      endAt: '2026-09-14T10:00:00+07:00',
      source,
    },
    context()
  );
  expect(api.create).toHaveBeenCalledWith(
    'workspace',
    expect.objectContaining({
      source,
      start_at: '2026-09-14T02:00:00.000Z',
      end_at: '2026-09-14T03:00:00.000Z',
    }),
    expect.anything()
  );
  expect(result).toEqual({
    success: true,
    event: { id: 'saved-event' },
    workspaceId: 'workspace',
  });
});
it('shares preview authorization across per-operation workspace snapshots', async () => {
  const executionState = {};
  api.preview.mockResolvedValue({ success: true, preview: { events: [] } });
  await executeCalendarAutomation(
    'preview_calendar_schedule',
    {},
    { ...context(), executionState }
  );
  await executeCalendarAutomation(
    'apply_calendar_schedule',
    {},
    { ...context(), executionState }
  );
  expect(api.apply).toHaveBeenCalledOnce();
});

it('normalizes offset timestamps in partial event updates', async () => {
  await executeCalendarAutomation(
    'update_event',
    { eventId: 'event', startAt: '2026-09-14T09:00:00+07:00' },
    context()
  );
  expect(api.update).toHaveBeenCalledWith(
    'workspace',
    'event',
    { start_at: '2026-09-14T02:00:00.000Z' },
    expect.anything()
  );
});

it('rejects cleartext remote Calendar configuration before forwarding auth', async () => {
  vi.stubEnv('CALENDAR_APP_URL', 'http://calendar.example.test');
  expect(
    await executeCalendarAutomation('sync_calendar', {}, context())
  ).toMatchObject({ success: false });
  expect(api.sync).not.toHaveBeenCalled();
});
it('permits explicit localhost HTTP only in development', async () => {
  vi.stubEnv('CALENDAR_APP_URL', 'http://localhost:3002');
  vi.stubEnv('NODE_ENV', 'development');
  api.sync.mockResolvedValue({ success: true });
  await executeCalendarAutomation('sync_calendar', {}, context());
  expect(api.sync).toHaveBeenCalledOnce();
  vi.stubEnv('NODE_ENV', 'production');
  expect(
    await executeCalendarAutomation('sync_calendar', {}, context())
  ).toMatchObject({ success: false });
  expect(api.sync).toHaveBeenCalledOnce();
});
