import { QueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { Dispatch, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
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
  wsId: string;
}) {
  useMiraChatEffects({
    messageAttachmentsRef: { current: new Map() },
    status: 'ready',
    isFullscreen: false,
    onToggleFullscreen: undefined,
    ...props,
  });

  return null;
}

describe('useMiraChatEffects', () => {
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
});
