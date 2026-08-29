import { beforeEach, describe, expect, it } from 'vitest';
import { reconcilePeriodicReportSchedules } from './schedule-reconciliation';

type Result = { data: unknown; error: unknown };
interface Write {
  op: 'insert' | 'update' | 'upsert';
  payload: Record<string, unknown>;
  table: string;
}

const TIMEZONE = 'Asia/Ho_Chi_Minh';
// 2026-09-01 09:00 in Asia/Ho_Chi_Minh: the first delivery slot of September,
// which is when a monthly schedule for August is expected to fire.
const NOW = new Date('2026-09-01T02:00:00.000Z');

function baseSchedule(overrides: Record<string, unknown> = {}) {
  return {
    cadence: 'monthly',
    created_by: 'creator-1',
    delivery_time: '09:00:00',
    enabled: true,
    generation_mode: 'ai',
    group_id: null,
    id: 'schedule-1',
    manager_instruction: null,
    next_run_at: null,
    timezone: TIMEZONE,
    ws_id: 'ws-1',
    ...overrides,
  };
}

function createAdminClientStub({
  groups = [{ id: 'group-1' }, { id: 'group-2' }],
  schedules,
}: {
  groups?: { id: string }[];
  schedules: Record<string, unknown>[];
}) {
  const writes: Write[] = [];
  const reads: Record<string, Result> = {
    user_report_automation_runs: { data: null, error: null },
    user_report_schedules: { data: schedules, error: null },
    workspace_user_groups: { data: groups, error: null },
  };

  /**
   * PostgREST-style chain over a real promise: every builder method returns the
   * same proxy, and awaiting it resolves the configured row for that table.
   * Proxying a Promise (instead of hand-rolling a `then`) keeps `await` and
   * `Promise.all` behaving exactly like the driver.
   */
  const makeBuilder = (table: string) => {
    const settled = Promise.resolve<Result>(
      reads[table] ?? { data: null, error: null }
    );
    const proxy: Record<string, unknown> = new Proxy(settled, {
      get(target, property) {
        if (
          property === 'then' ||
          property === 'catch' ||
          property === 'finally'
        ) {
          const member = Reflect.get(target, property, target);
          return typeof member === 'function' ? member.bind(target) : member;
        }

        return (payload: Record<string, unknown>) => {
          if (
            property === 'insert' ||
            property === 'update' ||
            property === 'upsert'
          ) {
            writes.push({ op: property, payload, table });
          }
          return proxy;
        };
      },
    }) as unknown as Record<string, unknown>;

    return proxy;
  };

  return {
    client: {
      from: (table: string) => makeBuilder(table),
      schema: () => ({ from: (table: string) => makeBuilder(table) }),
    },
    writes,
  };
}

function runInserts(writes: Write[]) {
  return writes.filter(
    (write) =>
      write.table === 'user_report_automation_runs' && write.op === 'insert'
  );
}

function scheduleUpdates(writes: Write[]) {
  return writes.filter(
    (write) => write.table === 'user_report_schedules' && write.op === 'update'
  );
}

describe('reconcilePeriodicReportSchedules', () => {
  let stub: ReturnType<typeof createAdminClientStub>;

  beforeEach(() => {
    stub = createAdminClientStub({ schedules: [baseSchedule()] });
  });

  it('creates a monthly run per active group for the completed period', async () => {
    await expect(
      reconcilePeriodicReportSchedules(stub.client as never, NOW)
    ).resolves.toEqual({ createdRuns: 2, dueSchedules: 1 });

    const inserts = runInserts(stub.writes);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.payload).toMatchObject({
      cadence: 'monthly',
      group_id: 'group-1',
      period_end: '2026-08-31',
      period_start: '2026-08-01',
      schedule_id: 'schedule-1',
      ws_id: 'ws-1',
    });
    expect(inserts[1]?.payload).toMatchObject({ group_id: 'group-2' });
  });

  it('advances next_run_at to the next period start at the local delivery time', async () => {
    await reconcilePeriodicReportSchedules(stub.client as never, NOW);

    expect(scheduleUpdates(stub.writes)[0]?.payload).toMatchObject({
      next_run_at: '2026-10-01T02:00:00.000Z',
    });
  });

  it('uses the in-progress week for a manual weekly schedule', async () => {
    const weekly = createAdminClientStub({
      schedules: [
        baseSchedule({ cadence: 'weekly', generation_mode: 'manual' }),
      ],
    });

    await reconcilePeriodicReportSchedules(weekly.client as never, NOW);

    expect(runInserts(weekly.writes)[0]?.payload).toMatchObject({
      cadence: 'weekly',
      period_end: '2026-09-06',
      period_start: '2026-08-31',
    });
    expect(scheduleUpdates(weekly.writes)[0]?.payload).toMatchObject({
      next_run_at: '2026-09-07T02:00:00.000Z',
    });
  });

  it('leaves groups that own a same-cadence override to that override', async () => {
    const overridden = createAdminClientStub({
      schedules: [
        baseSchedule(),
        baseSchedule({
          enabled: false,
          group_id: 'group-2',
          id: 'schedule-2',
        }),
      ],
    });

    const result = await reconcilePeriodicReportSchedules(
      overridden.client as never,
      NOW
    );

    expect(result.createdRuns).toBe(1);
    expect(runInserts(overridden.writes)[0]?.payload).toMatchObject({
      group_id: 'group-1',
    });
  });

  it('skips a disabled schedule and one whose next run is still ahead', async () => {
    const notDue = createAdminClientStub({
      schedules: [
        baseSchedule({ enabled: false }),
        baseSchedule({
          id: 'schedule-3',
          next_run_at: '2026-10-01T02:00:00.000Z',
        }),
      ],
    });

    await expect(
      reconcilePeriodicReportSchedules(notDue.client as never, NOW)
    ).resolves.toEqual({ createdRuns: 0, dueSchedules: 0 });
    expect(runInserts(notDue.writes)).toHaveLength(0);
  });

  it('skips a schedule with no timezone rather than guessing one', async () => {
    const noTimezone = createAdminClientStub({
      schedules: [baseSchedule({ timezone: null })],
    });

    const result = await reconcilePeriodicReportSchedules(
      noTimezone.client as never,
      NOW
    );

    expect(result).toEqual({ createdRuns: 0, dueSchedules: 1 });
    expect(runInserts(noTimezone.writes)).toHaveLength(0);
    expect(scheduleUpdates(noTimezone.writes)).toHaveLength(0);
  });

  it('creates nothing when the workspace has no active groups', async () => {
    const noGroups = createAdminClientStub({
      groups: [],
      schedules: [baseSchedule()],
    });

    await expect(
      reconcilePeriodicReportSchedules(noGroups.client as never, NOW)
    ).resolves.toEqual({ createdRuns: 0, dueSchedules: 1 });
    expect(scheduleUpdates(noGroups.writes)).toHaveLength(1);
  });
});
