import { describe, expect, it } from 'vitest';
import {
  coMemberTables,
  createFakeAdmin,
  type FakeTables,
} from '@/test/co-member-admin-fake';
import {
  cyclePlanningTaskSelect,
  isCurrentlyInCycle,
  isInNoWorkspaceCycle,
  type RawPlanningTask,
  toCyclePlanningTask,
  toCyclePlanningTasksForViewer,
} from './_cycle-planning-task';

const OLDER_CYCLE = '00000000-0000-4000-8000-0000000000c1';
const NEWER_CYCLE = '00000000-0000-4000-8000-0000000000c2';
const LOW_CYCLE = '00000000-0000-4000-8000-0000000000a1';
const HIGH_CYCLE = '00000000-0000-4000-8000-0000000000f1';

function task(cycleLinks: RawPlanningTask['cycle_links']): RawPlanningTask {
  return {
    id: 'task-1',
    name: 'Task',
    display_number: 1,
    priority: null,
    list: { status: 'active', board: { id: 'board-1', ticket_prefix: null } },
    cycle_links: cycleLinks,
    assignees: [],
    projects: [],
    labels: [],
  };
}

describe('cyclePlanningTaskSelect', () => {
  it('selects each link without requiring optional board-sprint columns', () => {
    for (const scope of ['cycle', 'backlog'] as const) {
      expect(cyclePlanningTaskSelect(scope)).toContain(
        'cycle_links:task_cycle_tasks!left(cycle_id, created_at, cycle:task_cycles!inner(*))'
      );
    }
  });

  it('narrows only the cycle scope to tasks linked to the requested cycle', () => {
    expect(cyclePlanningTaskSelect('cycle')).toContain(
      'in_cycle:task_cycle_tasks!inner(cycle_id)'
    );
    expect(cyclePlanningTaskSelect('backlog')).not.toContain('in_cycle');
  });
});

describe('current workspace cycle ignores board sprints and deleted cycles', () => {
  it('never reports a board sprint or a deleted cycle as the current cycle', () => {
    const raw = task([
      {
        cycle_id: OLDER_CYCLE,
        created_at: '2026-01-01T00:00:00Z',
        cycle: { board_id: null, deleted: false },
      },
      {
        cycle_id: NEWER_CYCLE,
        created_at: '2026-02-01T00:00:00Z',
        cycle: { board_id: 'board-1', deleted: false },
      },
      {
        cycle_id: HIGH_CYCLE,
        created_at: '2026-03-01T00:00:00Z',
        cycle: { board_id: null, deleted: true },
      },
    ]);

    expect(toCyclePlanningTask(raw).cycle_id).toBe(OLDER_CYCLE);
    expect(isCurrentlyInCycle(raw, OLDER_CYCLE)).toBe(true);
    expect(isCurrentlyInCycle(raw, NEWER_CYCLE)).toBe(false);
    expect(isInNoWorkspaceCycle(raw)).toBe(false);
    expect(
      isInNoWorkspaceCycle(
        task([{ cycle_id: NEWER_CYCLE, cycle: { board_id: 'board-1' } }])
      )
    ).toBe(true);
  });
});

describe('toCyclePlanningTask cycle_id with pre-existing duplicate links', () => {
  const older = {
    cycle_id: OLDER_CYCLE,
    created_at: '2026-01-01T00:00:00+00:00',
  };
  const newer = {
    cycle_id: NEWER_CYCLE,
    created_at: '2026-02-01T00:00:00+00:00',
  };

  it('picks the newest link whatever order PostgREST returns', () => {
    expect(toCyclePlanningTask(task([older, newer])).cycle_id).toBe(
      NEWER_CYCLE
    );
    expect(toCyclePlanningTask(task([newer, older])).cycle_id).toBe(
      NEWER_CYCLE
    );
  });

  it('breaks created_at ties by the lowest cycle_id', () => {
    const at = '2026-03-01T00:00:00+00:00';
    const high = { cycle_id: HIGH_CYCLE, created_at: at };
    const low = { cycle_id: LOW_CYCLE, created_at: at };

    expect(toCyclePlanningTask(task([high, low])).cycle_id).toBe(LOW_CYCLE);
    expect(toCyclePlanningTask(task([low, high])).cycle_id).toBe(LOW_CYCLE);
  });

  it('ranks a link without created_at after dated links', () => {
    const undated = { cycle_id: LOW_CYCLE, created_at: null };

    expect(toCyclePlanningTask(task([undated, older])).cycle_id).toBe(
      OLDER_CYCLE
    );
    expect(toCyclePlanningTask(task([older, undated])).cycle_id).toBe(
      OLDER_CYCLE
    );
  });

  it('compares instants, not timestamp strings', () => {
    const utc = {
      cycle_id: HIGH_CYCLE,
      created_at: '2026-04-01T00:30:00+00:00',
    };
    // 23:00 at -02:00 is 01:00 UTC, which is later than 00:30 UTC.
    const offset = {
      cycle_id: LOW_CYCLE,
      created_at: '2026-03-31T23:00:00-02:00',
    };

    expect(toCyclePlanningTask(task([utc, offset])).cycle_id).toBe(LOW_CYCLE);
  });

  it('returns null for a task in no cycle', () => {
    expect(toCyclePlanningTask(task([])).cycle_id).toBeNull();
    expect(toCyclePlanningTask(task(null)).cycle_id).toBeNull();
  });
});

describe('toCyclePlanningTasksForViewer assignee names (D246)', () => {
  const WS_ID = '00000000-0000-4000-8000-000000000001';
  const VIEWER = 'viewer-1';
  const raw: RawPlanningTask = {
    ...task([]),
    assignees: [
      {
        user: {
          id: 'nameless',
          display_name: null,
          handle: 'nameless-handle',
          avatar_url: null,
        },
      },
      { user: { id: 'named', display_name: 'Named', avatar_url: null } },
    ],
  };
  const members = [
    { user_id: VIEWER, type: 'MEMBER' as const },
    { user_id: 'nameless', type: 'MEMBER' as const },
    { user_id: 'named', type: 'MEMBER' as const },
  ];
  const emails = [
    { user_id: 'nameless', email: 'nameless@example.com' },
    { user_id: 'named', email: 'named@example.com' },
  ];

  async function assigneesFor(tables: FakeTables) {
    const [row] = await toCyclePlanningTasksForViewer([raw], {
      admin: createFakeAdmin(tables) as never,
      wsId: WS_ID,
      viewerUserId: VIEWER,
    });
    return row?.assignees;
  }

  it('selects the public handle with each assignee', () => {
    expect(cyclePlanningTaskSelect('backlog')).toContain(
      'user:users(id, display_name, handle, avatar_url)'
    );
  });

  it('shows a nameless co-member by email to a member viewer', async () => {
    expect(
      await assigneesFor(coMemberTables({ wsId: WS_ID, members, emails }))
    ).toEqual([
      {
        id: 'nameless',
        display_name: 'nameless@example.com',
        avatar_url: null,
      },
      { id: 'named', display_name: 'Named', avatar_url: null },
    ]);
  });

  it('keeps the handle when the workspace hides member emails', async () => {
    const assignees = await assigneesFor(
      coMemberTables({ wsId: WS_ID, hideEmail: true, members, emails })
    );

    expect(assignees?.[0]?.display_name).toBe('nameless-handle');
    expect(JSON.stringify(assignees)).not.toContain('@example.com');
  });

  it('never shows the email to a guest viewer or for a non-member', async () => {
    const asGuest = await assigneesFor(
      coMemberTables({
        wsId: WS_ID,
        members: [{ user_id: VIEWER, type: 'GUEST' }, ...members.slice(1)],
        emails,
      })
    );
    const nonMemberTarget = await assigneesFor(
      coMemberTables({ wsId: WS_ID, members: [members[0]!], emails })
    );

    expect(asGuest?.[0]?.display_name).toBe('nameless-handle');
    expect(nonMemberTarget?.[0]?.display_name).toBe('nameless-handle');
  });

  it('skips the lookup when no task has assignees', async () => {
    const admin = createFakeAdmin({});
    await toCyclePlanningTasksForViewer([task([])], {
      admin: admin as never,
      wsId: WS_ID,
      viewerUserId: VIEWER,
    });
    expect(admin.calls).toEqual([]);
  });
});
