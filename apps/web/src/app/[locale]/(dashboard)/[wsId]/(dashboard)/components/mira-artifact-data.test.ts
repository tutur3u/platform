import { getUserTaskDashboard } from '@tuturuuu/internal-api/tasks';
import { getWorkspace } from '@tuturuuu/internal-api/workspaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadArtifactRows } from './mira-artifact-data';

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getUserTaskDashboard: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({ getWorkspace: vi.fn() }));

const task = {
  id: 'external-task',
  name: 'Task from another workspace',
  end_date: '2026-09-12T09:00:00Z',
  priority: 'high',
  assignees: null,
  list: {
    id: 'list',
    name: 'In progress',
    status: 'active',
    board: {
      id: 'board',
      name: 'Delivery',
      ws_id: 'team',
      workspaces: { id: 'team', name: 'Team', personal: false },
    },
  },
};
describe('Mira task feed scope', () => {
  beforeEach(() => {
    vi.mocked(getUserTaskDashboard).mockResolvedValue({
      overdue: [task],
      today: [],
      upcoming: [],
      totalActiveTasks: 1,
    });
  });
  it('uses the personal cross-workspace feed for a resolved personal UUID', async () => {
    vi.mocked(getWorkspace).mockResolvedValue({
      id: 'personal-uuid',
      personal: true,
    } as Awaited<ReturnType<typeof getWorkspace>>);
    const rows = await loadArtifactRows('tasks', 'personal-uuid');
    expect(getUserTaskDashboard).toHaveBeenLastCalledWith({
      wsId: 'personal-uuid',
      isPersonal: true,
    });
    expect(rows[0]).toMatchObject({
      id: 'external-task',
      group: 'overdue',
      priority: 'high',
      path: '/team/boards/board?task=external-task',
    });
  });
  it('keeps a team context scoped to that workspace', async () => {
    vi.mocked(getWorkspace).mockResolvedValue({
      id: 'team',
      personal: false,
    } as Awaited<ReturnType<typeof getWorkspace>>);
    await loadArtifactRows('tasks', 'team');
    expect(getUserTaskDashboard).toHaveBeenLastCalledWith({
      wsId: 'team',
      isPersonal: false,
    });
  });
  it('does not silently broaden scope when workspace lookup fails', async () => {
    vi.mocked(getWorkspace).mockRejectedValueOnce(new Error('Forbidden'));
    await expect(loadArtifactRows('tasks', 'unknown')).rejects.toThrow(
      'Forbidden'
    );
  });
});
