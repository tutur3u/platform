import { expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import { executeTaskDashboard } from './task-dashboard';

const read = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/tasks', () => ({ getUserTaskDashboard: read }));
vi.mock('@tuturuuu/internal-api/client', () => ({
  withTaskApiBaseUrl: () => ({}),
  withForwardedInternalApiAuth: () => ({}),
}));
it('uses the same personal cross-workspace feed as the artifact and preserves source location', async () => {
  read.mockResolvedValue({
    totalActiveTasks: 1,
    overdue: [],
    today: [
      {
        id: 'task',
        name: 'Assigned task',
        list_id: 'list',
        list: {
          name: 'Focus',
          board: {
            id: 'board',
            name: 'Team board',
            ws_id: 'team',
            workspaces: { name: 'Team' },
          },
        },
      },
    ],
    upcoming: [],
  });
  const ctx = {
    wsId: 'personal',
    requestHeaders: new Headers(),
    workspaceContext: { wsId: 'personal', personal: true },
  } as unknown as MiraToolContext;
  expect(await executeTaskDashboard({}, ctx)).toMatchObject({
    today: {
      count: 1,
      tasks: [{ workspaceId: 'team', boardName: 'Team board' }],
    },
  });
  expect(read).toHaveBeenCalledWith(
    { wsId: 'personal', isPersonal: true },
    expect.anything()
  );
});
