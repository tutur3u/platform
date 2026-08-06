import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it, vi } from 'vitest';
import { CapacityRulesSettings } from './capacity-rules-settings';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTaskBoardCapacityRule: vi.fn(),
  deleteWorkspaceTaskBoardCapacityRule: vi.fn(),
  listWorkspaceLabels: vi.fn().mockResolvedValue([]),
  listWorkspaceTaskBoardCapacityRules: vi.fn().mockResolvedValue({ rules: [] }),
  listWorkspaceTaskProjects: vi.fn().mockResolvedValue([]),
  updateWorkspaceTaskBoardCapacityRule: vi.fn(),
}));

const readyList: TaskList = {
  archived: false,
  board_id: 'board-1',
  color: 'GREEN',
  created_at: '2026-08-06T00:00:00.000Z',
  creator_id: 'user-1',
  deleted: false,
  id: 'list-ready',
  name: 'Ready',
  position: 0,
  status: 'active',
};

function renderCapacitySettings(props?: { initialListId?: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CapacityRulesSettings
        boardId="board-1"
        initialListId={props?.initialListId}
        lists={[readyList]}
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
}

function openSelectorsTab() {
  // Radix activates a tab on mouseDown, not click.
  fireEvent.mouseDown(screen.getByRole('tab', { name: /tab_selectors/ }));
}

describe('CapacityRulesSettings', () => {
  it('starts a new rule with the contextual task list selected', () => {
    renderCapacitySettings({ initialListId: readyList.id });

    expect(screen.getByLabelText('name')).toBeInTheDocument();

    openSelectorsTab();
    expect(screen.getByRole('button', { name: 'Ready' })).toHaveClass(
      'bg-primary'
    );

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'add' }));

    openSelectorsTab();
    expect(screen.getByRole('button', { name: 'Ready' })).toHaveClass(
      'bg-primary'
    );
  });

  it('keeps the board settings view collapsed without a contextual list', () => {
    renderCapacitySettings();

    expect(screen.queryByLabelText('name')).not.toBeInTheDocument();
  });

  it('drops its card chrome when embedded in a surface that has its own', () => {
    // The dialog already draws a border; rendering the section's border inside
    // it is the doubled edge this prop exists to remove.
    const { container, rerender } = render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CapacityRulesSettings
          boardId="board-1"
          lists={[readyList]}
          wsId="ws-1"
        />
      </QueryClientProvider>
    );

    expect(container.querySelector('section')).toHaveClass('border');

    rerender(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CapacityRulesSettings
          boardId="board-1"
          embedded
          lists={[readyList]}
          wsId="ws-1"
        />
      </QueryClientProvider>
    );

    expect(container.querySelector('section')).not.toHaveClass('border');
  });
});
