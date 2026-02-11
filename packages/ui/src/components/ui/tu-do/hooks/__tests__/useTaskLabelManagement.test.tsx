/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskLabelManagement } from '../useTaskLabelManagement';

// Mock modules with proper hoisting
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock fetch globally
global.fetch = vi.fn() as any;

describe('useTaskLabelManagement', () => {
  let queryClient: QueryClient;
  let mockDelete: any;
  let mockInsert: any;
  let mockFrom: any;
  let mockToast: any;
  let mockCreateClient: any;

  const mockTask: Task = {
    id: 'task-1',
    name: 'Test Task',
    list_id: 'list-1',
    created_at: '2025-01-01',
    labels: [
      { id: 'label-1', name: 'Bug', color: '#ef4444' },
      { id: 'label-2', name: 'Feature', color: '#3b82f6' },
    ],
  } as Task;

  const mockWorkspaceLabels = [
    { id: 'label-1', name: 'Bug', color: '#ef4444', created_at: '2025-01-01' },
    {
      id: 'label-2',
      name: 'Feature',
      color: '#3b82f6',
      created_at: '2025-01-01',
    },
    {
      id: 'label-3',
      name: 'Enhancement',
      color: '#10b981',
      created_at: '2025-01-01',
    },
  ];

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Import mocked modules
    const { createClient } = await import('@tuturuuu/supabase/next/client');
    const { toast } = await import('@tuturuuu/ui/sonner');

    // Create mock functions
    mockDelete = vi.fn();
    mockInsert = vi.fn();
    mockFrom = vi.fn();
    mockToast = toast as any;
    mockCreateClient = createClient as any;

    vi.clearAllMocks();

    // Setup default mock implementations
    // The actual code uses: .delete().eq('task_id', taskId).eq('label_id', labelId)
    mockDelete.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    mockInsert.mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'task_labels') {
        return {
          delete: mockDelete,
          insert: mockInsert,
        };
      }
      return {};
    });

    mockCreateClient.mockReturnValue({
      from: mockFrom,
    });

    (global.fetch as any).mockClear();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      expect(result.current.newLabelName).toBe('');
      expect(result.current.newLabelColor).toBe('#3b82f6');
      expect(result.current.creatingLabel).toBe(false);
    });
  });

  describe('toggleTaskLabel', () => {
    it('should remove label when already active', async () => {
      // Set up initial cache
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.toggleTaskLabel('label-1');
      });

      // Check optimistic update
      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks?.[0]?.labels).toHaveLength(1);
      expect(cachedTasks?.[0]?.labels?.[0]?.id).toBe('label-2');

      // Verify Supabase delete was called
      expect(mockFrom).toHaveBeenCalledWith('task_labels');
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should add label when not active', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.toggleTaskLabel('label-3');
      });

      // Check optimistic update
      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks?.[0]?.labels).toHaveLength(3);
      expect(cachedTasks?.[0]?.labels?.some((l) => l.id === 'label-3')).toBe(
        true
      );

      // Verify Supabase insert was called
      expect(mockFrom).toHaveBeenCalledWith('task_labels');
      expect(mockInsert).toHaveBeenCalled();
    });

    it('should rollback on error and show toast', async () => {
      // Mock error for this test - using .eq().eq() pattern
      mockDelete.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi
            .fn()
            .mockResolvedValue({ error: { message: 'Database error' } }),
        }),
      });

      const originalTasks = [mockTask];
      queryClient.setQueryData(['tasks', 'board-1'], originalTasks);

      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.toggleTaskLabel('label-1');
      });

      // Check that cache was rolled back
      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toEqual(originalTasks);

      // Verify error toast was shown with the correct format
      expect(mockToast.error).toHaveBeenCalledWith('Error', {
        description: 'Failed to update label. Please try again.',
      });
    });
  });

  describe('createNewLabel', () => {
    it('should create new label and apply to task', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'label-4',
          name: 'New Label',
          color: '#8b5cf6',
        }),
      });

      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      // Set new label data
      act(() => {
        result.current.setNewLabelName('New Label');
        result.current.setNewLabelColor('#8b5cf6');
      });

      await act(async () => {
        await result.current.createNewLabel();
      });

      // Verify fetch was called with correct data
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/workspaces/ws-1/labels',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'New Label',
            color: '#8b5cf6',
          }),
        })
      );

      // Verify label was applied to task
      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks?.[0]?.labels).toHaveLength(3);
      expect(cachedTasks?.[0]?.labels?.some((l) => l.id === 'label-4')).toBe(
        true
      );

      // Verify form was reset
      expect(result.current.newLabelName).toBe('');
      expect(result.current.newLabelColor).toBe('#3b82f6');
    });

    it('should not create label with empty name', async () => {
      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.createNewLabel();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not create label without workspaceId', async () => {
      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: undefined,
          }),
        { wrapper }
      );

      act(() => {
        result.current.setNewLabelName('New Label');
      });

      await act(async () => {
        await result.current.createNewLabel();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle API error when creating label', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
      });

      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      act(() => {
        result.current.setNewLabelName('New Label');
      });

      await act(async () => {
        try {
          await result.current.createNewLabel();
        } catch (_) {
          // Expected to throw
        }
      });

      expect(mockToast.error).toHaveBeenCalledWith('Failed to create label');

      expect(result.current.creatingLabel).toBe(false);
    });

    it('should show partial success toast when label created but not applied', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'label-4',
          name: 'New Label',
          color: '#8b5cf6',
        }),
      });

      // Mock Supabase error on insert for this test
      mockInsert.mockResolvedValueOnce({ error: { message: 'Insert failed' } });

      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      act(() => {
        result.current.setNewLabelName('New Label');
      });

      await act(async () => {
        await result.current.createNewLabel();
      });

      // Should show error toast (not success)
      expect(mockToast.error).toHaveBeenCalledWith(
        'The label was created but could not be attached to the task. Refresh and try manually.'
      );

      // Should NOT show success toast
      expect(mockToast.success).not.toHaveBeenCalled();
    });

    it('should set creatingLabel state during operation', async () => {
      let resolvePromise: any;
      (global.fetch as any).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePromise = () =>
              resolve({
                ok: true,
                json: async () => ({
                  id: 'label-4',
                  name: 'New Label',
                  color: '#8b5cf6',
                }),
              });
          })
      );

      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      act(() => {
        result.current.setNewLabelName('New Label');
      });

      // Start the operation
      let createPromise: Promise<any>;
      act(() => {
        createPromise = result.current.createNewLabel();
      });

      // Should be creating immediately after call
      await waitFor(() => expect(result.current.creatingLabel).toBe(true));

      // Resolve the promise
      resolvePromise();
      await act(async () => {
        await createPromise!;
      });

      // Should be false after completion
      expect(result.current.creatingLabel).toBe(false);
    });

    it('should optimistically update workspace labels cache after creation', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'label-4',
          name: 'New Label',
          color: '#8b5cf6',
        }),
      });

      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);
      queryClient.setQueryData(
        ['workspace-labels', 'ws-1'],
        mockWorkspaceLabels
      );

      const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      act(() => {
        result.current.setNewLabelName('New Label');
      });

      await act(async () => {
        await result.current.createNewLabel();
      });

      // The implementation uses setQueryData for optimistic updates, not invalidateQueries
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        ['workspace-labels', 'ws-1'],
        expect.any(Function)
      );

      setQueryDataSpy.mockRestore();
    });
  });

  describe('state setters', () => {
    it('should update newLabelName', () => {
      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      act(() => {
        result.current.setNewLabelName('Updated Label');
      });

      expect(result.current.newLabelName).toBe('Updated Label');
    });

    it('should update newLabelColor', () => {
      const { result } = renderHook(
        () =>
          useTaskLabelManagement({
            task: mockTask,
            boardId: 'board-1',
            workspaceLabels: mockWorkspaceLabels,
            workspaceId: 'ws-1',
          }),
        { wrapper }
      );

      act(() => {
        result.current.setNewLabelColor('#f59e0b');
      });

      expect(result.current.newLabelColor).toBe('#f59e0b');
    });
  });
});
