import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssigneeSelect } from '../assignee-select';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({
    wsId: 'ws-1',
    boardId: 'board-1',
  }),
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-members', () => ({
  useWorkspaceMembers: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  updateWorkspaceTask: vi.fn(),
}));

vi.mock('../board-broadcast-context', () => ({
  useBoardBroadcast: () => null,
}));

describe('AssigneeSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not enter a render loop when rerendered with equivalent assignees', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const assignees: React.ComponentProps<typeof AssigneeSelect>['assignees'] =
      [
        {
          id: 'member-1',
          display_name: 'Alex',
          email: 'alex@example.com',
        },
      ];

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AssigneeSelect taskId="task-1" assignees={assignees} />
      </QueryClientProvider>
    );

    expect(() =>
      rerender(
        <QueryClientProvider client={queryClient}>
          <AssigneeSelect taskId="task-1" assignees={[{ ...assignees[0]! }]} />
        </QueryClientProvider>
      )
    ).not.toThrow();
  });
});
