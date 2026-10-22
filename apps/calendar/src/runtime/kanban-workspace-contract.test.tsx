import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import type { Workspace } from '@tuturuuu/types';
import type { ComponentProps, ReactNode } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import type { BulkActionsIsland } from '../../../../packages/tasks-ui/src/tu-do/boards/boardId/kanban/bulk/bulk-actions-island';
import { BulkActionsMenu } from '../../../../packages/tasks-ui/src/tu-do/boards/boardId/kanban/bulk/bulk-actions-menu';
import { useBulkResources } from '../../../../packages/tasks-ui/src/tu-do/boards/boardId/kanban/data/use-bulk-resources';

const ports = vi.hoisted(() => ({
  labels: vi.fn(),
  projects: vi.fn(),
  boardMembers: vi.fn(),
  workspaceMembers: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceLabels: ports.labels,
  listWorkspaceTaskProjects: ports.projects,
}));
vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTaskBoardViewableMembers: ports.boardMembers,
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-members', () => ({
  useWorkspaceMembers: ports.workspaceMembers,
}));
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));
vi.mock('@tuturuuu/ui/dropdown-menu', () => {
  const Container = ({ children, onClick }: ComponentProps<'div'>) => (
    <div onClick={onClick}>{children}</div>
  );
  const Item = ({ children, onClick, disabled }: ComponentProps<'button'>) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
  return {
    DropdownMenu: Container,
    DropdownMenuTrigger: Item,
    DropdownMenuContent: Container,
    DropdownMenuItem: Item,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuSub: Container,
    DropdownMenuSubContent: Container,
    DropdownMenuSubTrigger: Item,
  };
});

type MinimalWorkspace = Pick<Workspace, 'id' | 'personal'>;
const minimalWorkspace = {
  id: 'workspace-scope',
  personal: false,
} satisfies MinimalWorkspace;
let client: QueryClient;
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  ports.labels.mockResolvedValue([
    {
      id: 'label',
      name: 'Label',
      color: 'BLUE',
      created_at: '2026-10-19',
      ws_id: 'workspace-scope',
    },
  ]);
  ports.projects.mockResolvedValue([
    { id: 'active-project', status: 'active' },
    { id: 'deleted-project', status: 'deleted' },
  ]);
  ports.boardMembers.mockResolvedValue({
    members: [
      { user_id: 'shared-member', display_name: 'Shared' },
      { user_id: 'board-member', display_name: 'Board member' },
    ],
  });
  ports.workspaceMembers.mockReturnValue({ data: undefined });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function menuProps(
  workspace: MinimalWorkspace
): ComponentProps<typeof BulkActionsMenu> {
  return {
    workspace,
    boardConfig: null,
    columns: [],
    bulkWorking: false,
    estimationOptions: [],
    appliedSets: {
      labels: new Set(),
      projects: new Set(),
      assignees: new Set(),
    },
    filtered: {
      labels: [],
      projects: [],
      members: [
        {
          id: 'member',
          workspace_id: workspace.id,
          display_name: 'Member candidate',
        },
      ],
    },
    search: {
      labelQuery: '',
      setLabelQuery: vi.fn(),
      projectQuery: '',
      setProjectQuery: vi.fn(),
      assigneeQuery: '',
      setAssigneeQuery: vi.fn(),
    },
    actions: {
      bulkMoveToStatus: vi.fn(),
      bulkUpdatePriority: vi.fn(),
      bulkUpdateDueDate: vi.fn(),
      bulkUpdateEstimation: vi.fn(),
      bulkAddLabel: vi.fn(),
      bulkRemoveLabel: vi.fn(),
      bulkClearLabels: vi.fn(),
      bulkAddProject: vi.fn(),
      bulkRemoveProject: vi.fn(),
      bulkClearProjects: vi.fn(),
      bulkMoveToList: vi.fn(),
      bulkAddAssignee: vi.fn(),
      bulkRemoveAssignee: vi.fn(),
      bulkClearAssignees: vi.fn(),
    },
    onOpenCustomDate: vi.fn(),
    onConfirmDelete: vi.fn(),
  };
}

describe('real Kanban consumers accept the minimal authorized workspace scope', () => {
  it('carries the exact type through the resource hook, menu and island', () => {
    expectTypeOf<
      Parameters<typeof useBulkResources>[0]['workspace']
    >().toEqualTypeOf<MinimalWorkspace>();
    expectTypeOf<
      ComponentProps<typeof BulkActionsMenu>['workspace']
    >().toEqualTypeOf<MinimalWorkspace>();
    expectTypeOf<
      ComponentProps<typeof BulkActionsIsland>['menuProps']['workspace']
    >().toEqualTypeOf<MinimalWorkspace>();
  });
  it('queries by workspace identity and retains filtering/member deduplication', async () => {
    ports.workspaceMembers.mockReturnValue({
      data: [
        {
          id: 'shared-member',
          user_id: 'shared-member',
          workspace_id: minimalWorkspace.id,
        },
      ],
    });
    const { result } = renderHook(
      () =>
        useBulkResources({
          workspace: minimalWorkspace,
          boardId: 'board',
          assigneeMemberSource: 'workspace-and-board',
          isMultiSelectMode: true,
          selectedCount: 2,
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.workspaceLabels).toHaveLength(1));
    await waitFor(() =>
      expect(result.current.workspaceMembers).toHaveLength(2)
    );
    expect(ports.labels).toHaveBeenCalledWith('workspace-scope');
    expect(ports.projects).toHaveBeenCalledWith('workspace-scope');
    expect(ports.boardMembers).toHaveBeenCalledWith('workspace-scope', 'board');
    await waitFor(() =>
      expect(
        result.current.workspaceProjects.map((project) => project.id)
      ).toEqual(['active-project'])
    );
    expect(result.current.workspaceMembers.map((member) => member.id)).toEqual([
      'shared-member',
      'board-member',
    ]);
  });
  it('keeps personal workspaces on the board-member source', async () => {
    renderHook(
      () =>
        useBulkResources({
          workspace: { id: 'personal-scope', personal: true },
          boardId: 'board',
          isMultiSelectMode: true,
          selectedCount: 1,
        }),
      { wrapper }
    );
    await waitFor(() =>
      expect(ports.boardMembers).toHaveBeenCalledWith('personal-scope', 'board')
    );
    expect(ports.workspaceMembers).toHaveBeenCalledWith('personal-scope', {
      enabled: false,
    });
  });
  it('does not issue resource requests without active bulk selection', () => {
    renderHook(
      () =>
        useBulkResources({
          workspace: minimalWorkspace,
          boardId: 'board',
          isMultiSelectMode: false,
          selectedCount: 0,
        }),
      { wrapper }
    );
    expect(ports.labels).not.toHaveBeenCalled();
    expect(ports.projects).not.toHaveBeenCalled();
    expect(ports.boardMembers).not.toHaveBeenCalled();
  });
  it('renders and calls the existing assignee action from only a minimal workspace', () => {
    const props = menuProps(minimalWorkspace);
    render(<BulkActionsMenu {...props} />);
    expect(screen.getByText('common.assignees')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Member candidate/u }));
    expect(props.actions.bulkAddAssignee).toHaveBeenCalledWith('member');
  });
  it('keeps the personal-workspace assignee menu hidden', () => {
    render(
      <BulkActionsMenu
        {...menuProps({ id: 'personal-scope', personal: true })}
      />
    );
    expect(screen.queryByText('common.assignees')).toBeNull();
    expect(screen.queryByText('Member candidate')).toBeNull();
  });
});
