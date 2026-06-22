import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanPlannerIsland } from '../kanban-planner-island';

const mocks = vi.hoisted(() => ({
  addWorkspaceTaskPlanWorkspace: vi.fn(),
  createWorkspaceTaskPlan: vi.fn(),
  createWorkspaceTaskPlanItem: vi.fn(),
  createWorkspaceTaskPlanShare: vi.fn(),
  getWorkspaceTaskPlanDigest: vi.fn(),
  listWorkspaceBoardsWithLists: vi.fn(),
  listWorkspaceTaskPlans: vi.fn(),
  listWorkspaces: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key} ${values.name}` : key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({
    children,
    disabled,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <select
      disabled={disabled}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <option value="">{placeholder}</option>
  ),
}));

vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock('@tuturuuu/internal-api', async () => {
  const actual = await vi.importActual<typeof import('@tuturuuu/internal-api')>(
    '@tuturuuu/internal-api'
  );
  return {
    ...actual,
    addWorkspaceTaskPlanWorkspace: (...args: unknown[]) =>
      mocks.addWorkspaceTaskPlanWorkspace(...args),
    createWorkspaceTaskPlan: (...args: unknown[]) =>
      mocks.createWorkspaceTaskPlan(...args),
    createWorkspaceTaskPlanItem: (...args: unknown[]) =>
      mocks.createWorkspaceTaskPlanItem(...args),
    createWorkspaceTaskPlanShare: (...args: unknown[]) =>
      mocks.createWorkspaceTaskPlanShare(...args),
    getWorkspaceTaskPlanDigest: (...args: unknown[]) =>
      mocks.getWorkspaceTaskPlanDigest(...args),
    listWorkspaceTaskPlans: (...args: unknown[]) =>
      mocks.listWorkspaceTaskPlans(...args),
    listWorkspaceBoardsWithLists: (...args: unknown[]) =>
      mocks.listWorkspaceBoardsWithLists(...args),
    listWorkspaces: (...args: unknown[]) => mocks.listWorkspaces(...args),
  };
});

const basePlan = {
  id: 'plan-1',
  owner_id: 'user-1',
  personal_ws_id: 'ws-personal',
  title: 'Launch plan',
  period_type: 'week' as const,
  period_start: '2026-06-22',
  period_end: '2026-06-28',
  timezone: 'UTC',
  status: 'draft' as const,
  default_target_ws_id: 'team-ws',
  default_target_board_id: 'board-1',
  default_target_list_id: 'list-1',
  created_at: '2026-06-22T00:00:00.000Z',
  updated_at: '2026-06-22T00:00:00.000Z',
  archived_at: null,
  workspaces: [
    { plan_id: 'plan-1', ws_id: 'ws-personal' },
    { plan_id: 'plan-1', ws_id: 'team-ws' },
  ],
  shares: [
    {
      id: 'share-1',
      plan_id: 'plan-1',
      shared_with_ws_id: 'team-ws',
      shared_with_user_id: null,
      shared_with_email: null,
      permission: 'view' as const,
      shared_by_user_id: 'user-1',
      created_at: '2026-06-22T00:00:00.000Z',
      updated_at: '2026-06-22T00:00:00.000Z',
    },
  ],
  items: [
    {
      id: 'item-1',
      plan_id: 'plan-1',
      task_id: 'task-1',
      target_ws_id: 'team-ws',
      target_board_id: 'board-1',
      target_list_id: 'list-1',
      planned_start: '2026-06-23',
      planned_end: null,
      sort_key: 1,
      status: 'planned' as const,
      notes: 'Local timing override',
      snapshot_title: null,
      created_by_user_id: 'user-1',
      created_at: '2026-06-22T00:00:00.000Z',
      updated_at: '2026-06-22T00:00:00.000Z',
      task: { id: 'task-1', name: 'Team task' },
    },
  ],
};

function renderPlanner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <KanbanPlannerIsland
        boardId="board-1"
        isPersonalWorkspace
        workspaceId="ws-personal"
      />
    </QueryClientProvider>
  );
}

describe('KanbanPlannerIsland', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.listWorkspaces.mockResolvedValue([
      { id: 'ws-personal', name: 'Personal', personal: true },
      { id: 'team-ws', name: 'Team', personal: false },
    ]);
    mocks.listWorkspaceBoardsWithLists.mockResolvedValue({
      boards: [
        {
          id: 'board-1',
          name: 'Team board',
          task_lists: [{ id: 'list-1', name: 'Todo' }],
        },
      ],
    });
  });

  it('renders a compact disabled state when the plan schema is unavailable', async () => {
    mocks.listWorkspaceTaskPlans.mockResolvedValue({
      ok: false,
      code: 'schema_unavailable',
      schemaAvailable: false,
      message: 'Migration pending',
    });

    renderPlanner();

    expect(
      await screen.findByRole('button', { name: 'schema_unavailable' })
    ).toBeDisabled();
    expect(
      screen.queryByTestId('kanban-planner-island')
    ).not.toBeInTheDocument();
  });

  it('switches planner mode and creates a monthly plan', async () => {
    mocks.listWorkspaceTaskPlans.mockResolvedValue({
      ok: true,
      schemaAvailable: true,
      plans: [],
    });
    mocks.createWorkspaceTaskPlan.mockResolvedValue({
      ok: true,
      schemaAvailable: true,
      plan: basePlan,
    });

    renderPlanner();

    expect(await screen.findByText('open_planner')).toBeInTheDocument();
    expect(screen.queryByText('mode_month')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('kanban-planner-toggle'));

    fireEvent.click(await screen.findByText('mode_month'));
    fireEvent.change(screen.getByPlaceholderText('plan_title_placeholder'), {
      target: { value: 'Monthly roadmap' },
    });
    fireEvent.click(screen.getByText('create_plan'));

    await waitFor(() => {
      expect(mocks.createWorkspaceTaskPlan).toHaveBeenCalledWith(
        'ws-personal',
        expect.objectContaining({
          period_type: 'month',
          title: 'Monthly roadmap',
        })
      );
    });
  });

  it('shows source labels and shares a selected plan by email', async () => {
    mocks.listWorkspaceTaskPlans.mockResolvedValue({
      ok: true,
      schemaAvailable: true,
      plans: [basePlan],
    });
    mocks.createWorkspaceTaskPlanShare.mockResolvedValue({
      ok: true,
      schemaAvailable: true,
      share: basePlan.shares[0],
    });

    renderPlanner();

    fireEvent.click(await screen.findByTestId('kanban-planner-toggle'));

    expect(await screen.findByText('scope_team_source')).toBeInTheDocument();
    expect(screen.getByText('scope_external_workspace')).toBeInTheDocument();
    expect(screen.getByText('scope_my_override')).toBeInTheDocument();
    expect(screen.getByText('scope_shared_plan')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('share_plan')[0]!);
    fireEvent.change(screen.getByPlaceholderText('share_email_placeholder'), {
      target: { value: 'lead@example.com' },
    });
    fireEvent.click(screen.getByText('share_email'));

    await waitFor(() => {
      expect(mocks.createWorkspaceTaskPlanShare).toHaveBeenCalledWith(
        'ws-personal',
        'plan-1',
        { shared_with_email: 'lead@example.com', permission: 'view' }
      );
    });
  });
});
