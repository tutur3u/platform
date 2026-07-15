import { QueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { setActiveBoardRefresh } from '@tuturuuu/tasks-ui/tu-do/shared/board-broadcast-context';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { Dispatch, SetStateAction } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageFileAttachment } from '../file-preview-chips';
import {
  WORKSPACE_CONTEXT_EVENT,
  WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX,
} from '../mira-chat-constants';
import { useMiraChatEffects } from '../use-mira-chat-effects';

function TestHarness(props: {
  messages: UIMessage[];
  queryClient: QueryClient;
  routerRefresh: () => void;
  setMessageAttachments: Dispatch<
    SetStateAction<Map<string, MessageFileAttachment[]>>
  >;
  setWorkspaceContextId: (value: string) => void;
  status?: string;
  taskBoardId?: string;
  wsId: string;
}) {
  const { status = 'ready', ...rest } = props;
  useMiraChatEffects({
    messageAttachmentsRef: { current: new Map() },
    status,
    isFullscreen: false,
    onToggleFullscreen: undefined,
    ...rest,
  });

  return null;
}

describe('useMiraChatEffects', () => {
  afterEach(() => {
    setActiveBoardRefresh(null);
  });

  it('syncs assistant workspace context changes from tool parts keyed only by type', async () => {
    const wsId = 'dashboard-ws';
    const nextWorkspaceContextId = 'workspace-team-123';
    const queryClient = new QueryClient();
    const setWorkspaceContextId = vi.fn();
    const setMessageAttachments = vi.fn();
    const routerRefresh = vi.fn();
    const workspaceEvents: string[] = [];
    const handleWorkspaceContextEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          workspaceContextId?: string;
        }>
      ).detail;
      if (detail?.workspaceContextId) {
        workspaceEvents.push(detail.workspaceContextId);
      }
    };

    window.localStorage.clear();
    window.addEventListener(
      WORKSPACE_CONTEXT_EVENT,
      handleWorkspaceContextEvent
    );

    render(
      <TestHarness
        wsId={wsId}
        queryClient={queryClient}
        routerRefresh={routerRefresh}
        setMessageAttachments={setMessageAttachments}
        setWorkspaceContextId={setWorkspaceContextId}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-set_workspace_context',
                toolCallId: 'tool-call-1',
                state: 'output-available',
                input: {
                  workspaceId: nextWorkspaceContextId,
                },
                output: {
                  success: true,
                  workspaceContextId: nextWorkspaceContextId,
                },
              },
            ],
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(setWorkspaceContextId).toHaveBeenCalledWith(
        nextWorkspaceContextId
      );
    });

    expect(
      window.localStorage.getItem(
        `${WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX}${wsId}`
      )
    ).toBe(nextWorkspaceContextId);
    expect(workspaceEvents).toContain(nextWorkspaceContextId);

    window.removeEventListener(
      WORKSPACE_CONTEXT_EVENT,
      handleWorkspaceContextEvent
    );
  });

  it('normalizes internal workspace context ids before persisting and dispatching', async () => {
    const wsId = 'dashboard-ws';
    const queryClient = new QueryClient();
    const setWorkspaceContextId = vi.fn();
    const setMessageAttachments = vi.fn();
    const routerRefresh = vi.fn();
    const workspaceEvents: string[] = [];
    const handleWorkspaceContextEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          workspaceContextId?: string;
        }>
      ).detail;
      if (detail?.workspaceContextId) {
        workspaceEvents.push(detail.workspaceContextId);
      }
    };

    window.localStorage.clear();
    window.addEventListener(
      WORKSPACE_CONTEXT_EVENT,
      handleWorkspaceContextEvent
    );

    render(
      <TestHarness
        wsId={wsId}
        queryClient={queryClient}
        routerRefresh={routerRefresh}
        setMessageAttachments={setMessageAttachments}
        setWorkspaceContextId={setWorkspaceContextId}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-set_workspace_context',
                toolCallId: 'tool-call-1',
                state: 'output-available',
                input: {
                  workspaceContextId: 'internal',
                },
                output: {
                  success: true,
                  workspaceContextId: 'internal',
                },
              },
            ],
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(setWorkspaceContextId).toHaveBeenCalledWith(ROOT_WORKSPACE_ID);
    });

    expect(
      window.localStorage.getItem(
        `${WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX}${wsId}`
      )
    ).toBe(ROOT_WORKSPACE_ID);
    expect(workspaceEvents).toContain(ROOT_WORKSPACE_ID);

    window.removeEventListener(
      WORKSPACE_CONTEXT_EVENT,
      handleWorkspaceContextEvent
    );
  });

  it('revalidates active board caches without invalidating visible Kanban tasks when Mira task tools finish', async () => {
    const wsId = 'dashboard-ws';
    const boardId = 'board-123';
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const setWorkspaceContextId = vi.fn();
    const setMessageAttachments = vi.fn();
    const routerRefresh = vi.fn();
    const refreshActiveBoard = vi.fn();
    setActiveBoardRefresh(refreshActiveBoard);

    render(
      <TestHarness
        wsId={wsId}
        taskBoardId={boardId}
        queryClient={queryClient}
        routerRefresh={routerRefresh}
        setMessageAttachments={setMessageAttachments}
        setWorkspaceContextId={setWorkspaceContextId}
        messages={[
          {
            id: 'assistant-task-tool',
            role: 'assistant',
            parts: [
              {
                type: 'tool-create_task',
                toolCallId: 'tool-call-task',
                state: 'output-available',
                input: {
                  name: 'Follow up',
                  boardId,
                },
                output: {
                  success: true,
                  task: { id: 'task-1', name: 'Follow up' },
                },
              },
            ],
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(refreshActiveBoard).toHaveBeenCalledWith({
        includeLists: undefined,
        invalidateTasks: false,
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['tasks'],
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['task'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-tasks'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['task-board', wsId],
      exact: true,
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['tasks', boardId],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['task_lists', boardId],
    });
  });

  it('invalidates list caches only for Mira task-list tools', async () => {
    const wsId = 'dashboard-ws';
    const boardId = 'board-123';
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const setWorkspaceContextId = vi.fn();
    const setMessageAttachments = vi.fn();
    const routerRefresh = vi.fn();
    const refreshActiveBoard = vi.fn();
    setActiveBoardRefresh(refreshActiveBoard);

    render(
      <TestHarness
        wsId={wsId}
        taskBoardId={boardId}
        queryClient={queryClient}
        routerRefresh={routerRefresh}
        setMessageAttachments={setMessageAttachments}
        setWorkspaceContextId={setWorkspaceContextId}
        messages={[
          {
            id: 'assistant-list-tool',
            role: 'assistant',
            parts: [
              {
                type: 'tool-create_task_list',
                toolCallId: 'tool-call-list',
                state: 'output-available',
                input: {
                  boardId,
                  name: 'Review',
                },
                output: {
                  success: true,
                  list: { id: 'list-1', name: 'Review' },
                },
              },
            ],
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['task_lists', boardId],
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['task-board', wsId, boardId],
    });
    expect(refreshActiveBoard).toHaveBeenCalledWith({
      includeLists: true,
      invalidateTasks: false,
    });
  });

  it('does not refresh the whole route when a board-scoped Mira exchange completes', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const setWorkspaceContextId = vi.fn();
    const setMessageAttachments = vi.fn();
    const routerRefresh = vi.fn();
    const { rerender } = render(
      <TestHarness
        wsId="dashboard-ws"
        taskBoardId="board-123"
        queryClient={queryClient}
        routerRefresh={routerRefresh}
        setMessageAttachments={setMessageAttachments}
        setWorkspaceContextId={setWorkspaceContextId}
        messages={[]}
        status="streaming"
      />
    );

    rerender(
      <TestHarness
        wsId="dashboard-ws"
        taskBoardId="board-123"
        queryClient={queryClient}
        routerRefresh={routerRefresh}
        setMessageAttachments={setMessageAttachments}
        setWorkspaceContextId={setWorkspaceContextId}
        messages={[]}
        status="ready"
      />
    );

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['ai-credits'],
      });
    });
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
