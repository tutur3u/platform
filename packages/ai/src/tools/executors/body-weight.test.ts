import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import {
  executeGetBodyWeightHistory,
  executeLogBodyWeight,
} from './body-weight';
import { supabaseStub, trackerFixture } from './habit-test-utils';

const api = vi.hoisted(() => ({
  listTrackers: vi.fn(),
  createTracker: vi.fn(),
  listEntries: vi.fn(),
  createEntry: vi.fn(),
  forward: vi.fn((_headers: unknown, options: Record<string, unknown>) => ({
    ...options,
    forwarded: true,
  })),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceHabitTrackers: api.listTrackers,
  createWorkspaceHabitTracker: api.createTracker,
  listWorkspaceHabitTrackerEntries: api.listEntries,
  createWorkspaceHabitTrackerEntry: api.createEntry,
}));
vi.mock('@tuturuuu/internal-api/client', () => ({
  withForwardedInternalApiAuth: api.forward,
}));

const headers = new Headers({ authorization: 'Bearer user-token' });
function context(overrides: Partial<MiraToolContext> = {}) {
  return {
    userId: 'user-1',
    wsId: 'team-ws',
    timezone: 'Asia/Ho_Chi_Minh',
    requestHeaders: headers,
    supabase: supabaseStub({
      workspaces: { data: { id: 'personal-ws' }, error: null },
    }),
    ...overrides,
  } as unknown as MiraToolContext;
}
const trackersIn = (
  byWs: Record<string, ReturnType<typeof trackerFixture>[]>
) =>
  api.listTrackers.mockImplementation(async (wsId: string) => ({
    trackers: (byWs[wsId] ?? []).map((tracker) => ({ tracker })),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  api.createEntry.mockImplementation(
    async (_ws: string, _id: string, input: { entry_date: string }) => ({
      id: 'entry-1',
      entry_date: input.entry_date,
    })
  );
  api.createTracker.mockImplementation(
    async (wsId: string, input: Record<string, unknown>) =>
      trackerFixture({
        id: '00000000-0000-4000-8000-0000000000aa',
        ws_id: wsId,
        composer_config: input.composer_config as never,
      })
  );
});

describe('log_body_weight', () => {
  it('returns unavailable without forwarded request headers', async () => {
    const result = await executeLogBodyWeight(
      { value: 70 },
      context({ requestHeaders: undefined })
    );
    expect(result).toMatchObject({ success: false });
    expect(String((result as { error: string }).error)).toMatch(/unavailable/);
    expect(api.listTrackers).not.toHaveBeenCalled();
  });

  it('forwards the caller auth to the Tasks satellite', async () => {
    trackersIn({ 'team-ws': [trackerFixture()] });
    await executeLogBodyWeight({ value: 70 }, context());
    expect(api.forward).toHaveBeenCalledWith(headers, {
      baseUrl: expect.stringContaining('tasks'),
    });
    expect(api.createEntry).toHaveBeenCalledWith(
      'team-ws',
      trackerFixture().id,
      expect.anything(),
      expect.objectContaining({ forwarded: true })
    );
  });

  it('logs to an existing tracker without creating one', async () => {
    trackersIn({ 'team-ws': [trackerFixture()] });
    const result = await executeLogBodyWeight(
      { value: 72.4, occurredAt: '2026-10-24T18:30:00Z' },
      context()
    );
    expect(api.createTracker).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      trackerCreated: false,
      workspace: { id: 'team-ws', personal: false, isCurrentWorkspace: true },
      // 18:30Z is 01:30 the next day in Ho Chi Minh City.
      entry: { date: '2026-10-25', value: 72.4, unit: 'kg' },
    });
  });

  it('creates a private tracker in the personal workspace, never the team one', async () => {
    trackersIn({});
    const result = await executeLogBodyWeight(
      { value: 160, unit: 'lb' },
      context()
    );
    expect(api.createTracker).toHaveBeenCalledTimes(1);
    expect(api.createTracker).toHaveBeenCalledWith(
      'personal-ws',
      expect.objectContaining({
        use_case: 'body_weight',
        composer_config: expect.objectContaining({ unit: 'lb' }),
      }),
      expect.anything()
    );
    expect(result).toMatchObject({
      success: true,
      trackerCreated: true,
      workspace: {
        id: 'personal-ws',
        personal: true,
        isCurrentWorkspace: false,
      },
      entry: { value: 160, unit: 'lb' },
    });
  });

  it('reuses a personal tracker when the team workspace has none', async () => {
    trackersIn({ 'personal-ws': [trackerFixture({ ws_id: 'personal-ws' })] });
    const result = await executeLogBodyWeight({ value: 70 }, context());
    expect(api.createTracker).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      trackerCreated: false,
      workspace: { id: 'personal-ws', personal: true },
    });
  });

  it('creates in the current workspace when it is already personal', async () => {
    trackersIn({});
    const result = await executeLogBodyWeight(
      { value: 70 },
      context({
        wsId: 'personal-ws',
        workspaceContext: {
          workspaceContextId: 'personal',
          wsId: 'personal-ws',
          name: 'Personal',
          personal: true,
          memberCount: 1,
        },
      })
    );
    expect(api.createTracker).toHaveBeenCalledWith(
      'personal-ws',
      expect.objectContaining({
        composer_config: expect.objectContaining({ unit: 'kg' }),
      }),
      expect.anything()
    );
    expect(result).toMatchObject({
      trackerCreated: true,
      workspace: { id: 'personal-ws', isCurrentWorkspace: true },
    });
  });

  it('refuses to create anything without a personal workspace', async () => {
    trackersIn({});
    const result = await executeLogBodyWeight(
      { value: 70 },
      context({
        supabase: supabaseStub({ workspaces: { data: null, error: null } }),
      } as Partial<MiraToolContext>)
    );
    expect(result).toMatchObject({ success: false });
    expect(api.createTracker).not.toHaveBeenCalled();
    expect(api.createEntry).not.toHaveBeenCalled();
  });

  it('reports a created tracker even when the entry write fails', async () => {
    trackersIn({});
    api.createEntry.mockRejectedValueOnce(new Error('Entry rejected'));
    expect(await executeLogBodyWeight({ value: 70 }, context())).toEqual({
      success: false,
      trackerCreated: true,
      workspace: {
        id: 'personal-ws',
        personal: true,
        isCurrentWorkspace: false,
      },
      error: 'Entry rejected',
    });
  });

  it("converts to the tracker's unit", async () => {
    trackersIn({ 'team-ws': [trackerFixture()] });
    const result = await executeLogBodyWeight(
      { value: 154, unit: 'lb' },
      context()
    );
    expect(result).toMatchObject({
      entry: { value: 69.85, unit: 'kg' },
      convertedFrom: { value: 154, unit: 'lb' },
    });
    expect(api.createEntry.mock.calls[0]?.[2]).toMatchObject({
      values: { weight: 69.85 },
    });
  });

  it('rejects implausible weights before creating a tracker', async () => {
    trackersIn({});
    for (const value of [1, 900]) {
      expect(await executeLogBodyWeight({ value }, context())).toMatchObject({
        success: false,
      });
    }
    expect(
      await executeLogBodyWeight({ value: 1500, unit: 'lb' }, context())
    ).toMatchObject({ success: false });
    expect(api.createTracker).not.toHaveBeenCalled();
    expect(api.createEntry).not.toHaveBeenCalled();
  });
});

describe('get_body_weight_history', () => {
  it('summarizes only the caller entries inside the window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T03:00:00Z'));
    trackersIn({ 'team-ws': [trackerFixture()] });
    const entry = (date: string, value: number, user = 'user-1') => ({
      id: `${user}-${date}`,
      user_id: user,
      entry_date: date,
      occurred_at: `${date}T01:00:00Z`,
      values: { weight: value },
      primary_value: value,
    });
    api.listEntries.mockResolvedValue([
      entry('2026-10-25', 71.2),
      entry('2026-10-20', 72),
      entry('2026-10-19', 73.5),
      entry('2026-10-12', 74),
      entry('2026-10-22', 95, 'someone-else'),
    ]);
    const result = await executeGetBodyWeightHistory({ days: 7 }, context());
    vi.useRealTimers();
    expect(result).toMatchObject({
      success: true,
      period: { days: 7, from: '2026-10-19', to: '2026-10-25' },
      summary: {
        count: 3,
        latest: { value: 71.2, date: '2026-10-25' },
        earliest: { value: 73.5, date: '2026-10-19' },
        change: -2.3,
        min: 71.2,
        max: 73.5,
      },
    });
    expect((result as { entries: unknown[] }).entries).toHaveLength(3);
    expect(api.createTracker).not.toHaveBeenCalled();
  });

  it('reports a missing tracker without creating one', async () => {
    trackersIn({});
    expect(await executeGetBodyWeightHistory({}, context())).toMatchObject({
      success: true,
      tracker: null,
      summary: null,
    });
    expect(api.createTracker).not.toHaveBeenCalled();
  });
});
