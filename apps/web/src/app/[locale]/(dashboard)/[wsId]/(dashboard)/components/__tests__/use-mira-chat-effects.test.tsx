import { QueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { Dispatch, SetStateAction } from 'react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MessageFileAttachment } from '../file-preview-chips';
import {
  WORKSPACE_CONTEXT_EVENT,
  WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX,
} from '../mira-chat-constants';
import { useMiraChatEffects } from '../use-mira-chat-effects';

const audioAttachment: MessageFileAttachment = {
  id: 'attachment-1',
  name: 'clip.wav',
  size: 1,
  type: 'audio/wav',
  previewUrl: null,
  signedUrl: null,
  storagePath: 'ws/audio.wav',
};

function TestHarness(props: {
  initialMessageAttachments?: Map<string, MessageFileAttachment[]>;
  messages: UIMessage[];
  queryClient: QueryClient;
  routerRefresh: () => void;
  setMessageAttachments: Dispatch<
    SetStateAction<Map<string, MessageFileAttachment[]>>
  >;
  setWorkspaceContextId: (value: string) => void;
  wsId: string;
}) {
  const messageAttachmentsRef = useRef(
    new Map<string, MessageFileAttachment[]>()
  );
  messageAttachmentsRef.current =
    props.initialMessageAttachments ??
    new Map<string, MessageFileAttachment[]>();

  useMiraChatEffects({
    messageAttachmentsRef,
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

  it('clears transient pending attachment snapshots when the real user message arrives', async () => {
    const queryClient = new QueryClient();
    const setWorkspaceContextId = vi.fn();
    const setMessageAttachments = vi.fn((updater) => {
      const prev = new Map([
        ['pending', [audioAttachment]],
        ['user-1', [audioAttachment]],
      ]);

      return typeof updater === 'function' ? updater(prev) : updater;
    });

    render(
      <TestHarness
        initialMessageAttachments={
          new Map([
            ['pending', [audioAttachment]],
            ['user-1', [audioAttachment]],
          ])
        }
        wsId="dashboard-ws"
        queryClient={queryClient}
        routerRefresh={vi.fn()}
        setMessageAttachments={setMessageAttachments}
        setWorkspaceContextId={setWorkspaceContextId}
        messages={[
          {
            id: 'user-1',
            role: 'user',
            parts: [
              { type: 'text', text: 'Please analyze the attached file(s).' },
            ],
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(setMessageAttachments).toHaveBeenCalledTimes(1);
    });

    const updater = setMessageAttachments.mock.calls[0]?.[0] as (
      prev: Map<string, MessageFileAttachment[]>
    ) => Map<string, MessageFileAttachment[]>;
    const next = updater(
      new Map([
        ['pending', [audioAttachment]],
        ['user-1', [audioAttachment]],
      ])
    );

    expect(next.has('pending')).toBe(false);
    expect(next.has('queued')).toBe(false);
    expect(next.get('user-1')).toHaveLength(1);
  });
});
