import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskInitiativesPage from './task-initiatives-page';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  workspace: vi.fn(),
  permissions: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  client: vi.fn(),
}));
vi.mock('@tuturuuu/utils/user-helper', () => ({ getCurrentUser: mocks.user }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: mocks.workspace,
  getPermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('./task-initiatives-client', () => ({
  TaskInitiativesClient: mocks.client,
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  notFound: () => {
    throw new Error('not-found');
  },
}));

const sessionUser = { id: 'actor' };
const params = Promise.resolve({ wsId: 'personal' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.mockResolvedValue({ id: 'workspace-1', joined: true });
  mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
  mocks.admin.mockResolvedValue({ from: mocks.from });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: [], error: null });
});

describe('Bookmarked initiatives page', () => {
  it('renders existing initiative and project data using the satellite actor', async () => {
    mocks.order.mockResolvedValue({
      data: [
        {
          id: 'initiative-1',
          name: 'Existing initiative',
          description: null,
          status: 'active',
          created_at: '2026-01-01',
          creator: null,
          task_project_initiatives: [
            {
              project_id: 'project-1',
              project: {
                id: 'project-1',
                name: 'Existing project',
                status: 'active',
              },
            },
          ],
        },
      ],
      error: null,
    });
    const page = await TaskInitiativesPage({ params, sessionUser });
    const client = page.props.children[1];
    expect(client.type).toBe(mocks.client);
    expect(client.props).toMatchObject({
      wsId: 'workspace-1',
      initialInitiatives: [
        {
          id: 'initiative-1',
          name: 'Existing initiative',
          projectsCount: 1,
          linkedProjects: [{ id: 'project-1', name: 'Existing project' }],
        },
      ],
    });
    expect(mocks.workspace).toHaveBeenCalledWith('personal', {
      useAdmin: true,
      user: sessionUser,
    });
    expect(mocks.permissions).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      user: sessionUser,
    });
    expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it('rejects a missing satellite session without falling back to Supabase auth', async () => {
    await expect(
      TaskInitiativesPage({ params, sessionUser: null })
    ).rejects.toThrow('redirect:/login');
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it('retains workspace and manage_projects access checks before reading initiatives', async () => {
    mocks.workspace.mockResolvedValueOnce(null);
    await expect(TaskInitiativesPage({ params, sessionUser })).rejects.toThrow(
      'not-found'
    );
    mocks.workspace.mockResolvedValueOnce({ id: 'workspace-1', joined: false });
    await expect(TaskInitiativesPage({ params, sessionUser })).rejects.toThrow(
      'redirect:/'
    );
    mocks.permissions.mockResolvedValueOnce(null);
    await expect(TaskInitiativesPage({ params, sessionUser })).rejects.toThrow(
      'not-found'
    );
    const withoutPermission = vi.fn(() => true);
    mocks.permissions.mockResolvedValueOnce({ withoutPermission });
    await expect(TaskInitiativesPage({ params, sessionUser })).rejects.toThrow(
      'redirect:/workspace-1'
    );
    expect(withoutPermission).toHaveBeenCalledWith('manage_projects');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
