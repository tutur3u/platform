import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { Workspace } from '@tuturuuu/types';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  normalizeWorkspaceMemberList,
  useBulkResources,
} from './use-bulk-resources';

vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceLabels: vi.fn(async () => []),
  listWorkspaceTaskProjects: vi.fn(async () => []),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTaskBoardViewableMembers: vi.fn(async () => ({ members: [] })),
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-members', () => ({
  useWorkspaceMembers: vi.fn(() => ({ data: [] })),
}));

describe('normalizeWorkspaceMemberList', () => {
  it('preserves valid member arrays', () => {
    const members = [{ id: 'member-1', user_id: 'member-1' }];

    expect(normalizeWorkspaceMemberList(members)).toBe(members);
  });

  it.each([undefined, null, {}, { members: [] }, 'invalid'])(
    'returns an empty array for a non-array cache value',
    (value) => {
      expect(normalizeWorkspaceMemberList(value)).toEqual([]);
    }
  );
});

describe('useBulkResources', () => {
  it('normalizes a conflicting board-member cache value before merging', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ['task-board-viewable-members', 'workspace-1', 'board-1'],
      { members: [{ user_id: 'member-1' }] }
    );
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(
      () =>
        useBulkResources({
          boardId: 'board-1',
          canUseBoardAssignees: true,
          assigneeMemberSource: 'board',
          workspace: {
            id: 'workspace-1',
            personal: false,
          } as Workspace,
          isMultiSelectMode: true,
          selectedCount: 1,
        }),
      { wrapper }
    );

    expect(result.current.workspaceMembers).toEqual([]);
    expect(Array.isArray(result.current.workspaceMembers)).toBe(true);
  });
});
