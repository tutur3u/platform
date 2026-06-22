import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskFilters } from '../../shared/task-filter.types';
import { TaskFilter } from './task-filter';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceLabels: vi.fn(() => Promise.resolve([])),
  listWorkspaceTaskBoards: vi.fn(() =>
    Promise.resolve({ boards: [], count: 0 })
  ),
  listWorkspaceTaskProjects: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  listWorkspaces: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-members', () => ({
  useWorkspaceMembers: () => ({ data: [] }),
}));

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    placeholder,
  }: {
    children?: React.ReactNode;
    placeholder?: string;
  }) => (
    <button type="button" aria-label={placeholder}>
      {placeholder}
    </button>
  ),
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

const baseFilters: TaskFilters = {
  assignees: [],
  dueDateRange: null,
  estimationRange: null,
  includeMyTasks: false,
  includeUnassigned: false,
  labels: [],
  priorities: [],
  projects: [],
  sourceBoardIds: [],
  sourceScope: 'all_visible',
  sourceWorkspaceIds: [],
};

function renderTaskFilter(
  overrides?: Partial<React.ComponentProps<typeof TaskFilter>>
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const onFiltersChange = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <TaskFilter
        currentUserId="user-1"
        filters={baseFilters}
        onFiltersChange={onFiltersChange}
        wsId="ws-1"
        {...overrides}
      />
    </QueryClientProvider>
  );

  return { onFiltersChange };
}

describe('TaskFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps due-date controls compact inside the filter panel', () => {
    const { onFiltersChange } = renderTaskFilter();

    fireEvent.click(screen.getByRole('button', { name: 'common.filters' }));

    expect(screen.getByLabelText('common.from')).toHaveAttribute(
      'type',
      'date'
    );
    expect(screen.getByLabelText('common.to')).toHaveAttribute('type', 'date');
    expect(
      screen.queryByRole('grid', { name: /calendar/i })
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('common.from'), {
      target: { value: '2026-06-22' },
    });

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDateRange: expect.objectContaining({
          from: expect.any(Date),
        }),
      })
    );
  });
});
