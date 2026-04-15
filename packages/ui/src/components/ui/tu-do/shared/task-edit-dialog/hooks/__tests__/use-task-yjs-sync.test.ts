import { renderHook, waitFor } from '@testing-library/react';
import type { JSONContent } from '@tiptap/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { useTaskYjsSync } from '../use-task-yjs-sync';

const taskApiMocks = vi.hoisted(() => ({
  mockFetchWorkspaceTaskDescription: vi.fn(),
  mockUpdateWorkspaceTaskDescription: vi.fn(),
}));

const yjsHelperMocks = vi.hoisted(() => ({
  mockConvertJsonContentToYjsState: vi.fn(),
  mockConvertYjsStateToJsonContent: vi.fn(),
}));

vi.mock('../task-api', () => ({
  fetchWorkspaceTaskDescription: taskApiMocks.mockFetchWorkspaceTaskDescription,
  updateWorkspaceTaskDescription:
    taskApiMocks.mockUpdateWorkspaceTaskDescription,
}));

vi.mock('@tuturuuu/utils/yjs-helper', () => ({
  convertJsonContentToYjsState: yjsHelperMocks.mockConvertJsonContentToYjsState,
  convertYjsStateToJsonContent: yjsHelperMocks.mockConvertYjsStateToJsonContent,
}));

function createValidYjsState(): Uint8Array {
  const doc = new Y.Doc();
  doc.getMap('seed').set('k', 'v');
  return Y.encodeStateAsUpdate(doc);
}

describe('useTaskYjsSync', () => {
  const description: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Canonical description' }],
      },
    ],
  };

  const makeProps = () => ({
    taskId: 'task-1',
    wsId: 'ws-1',
    boardId: 'board-1',
    isOpen: true,
    isCreateMode: false,
    realtimeEnabled: false,
    description,
    editorInstance: { schema: {} } as any,
    doc: new Y.Doc(),
    queryClient: {} as any,
    flushEditorPendingRef: { current: undefined },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes missing yjs state from canonical description', async () => {
    const yjsState = createValidYjsState();
    yjsHelperMocks.mockConvertJsonContentToYjsState.mockReturnValueOnce(
      yjsState
    );
    taskApiMocks.mockFetchWorkspaceTaskDescription.mockResolvedValueOnce({
      description: JSON.stringify(description),
      description_yjs_state: null,
    });
    taskApiMocks.mockUpdateWorkspaceTaskDescription.mockResolvedValueOnce({});

    renderHook(() => useTaskYjsSync(makeProps()));

    await waitFor(() => {
      expect(
        taskApiMocks.mockUpdateWorkspaceTaskDescription
      ).toHaveBeenCalledWith('ws-1', 'task-1', {
        description_yjs_state: Array.from(yjsState),
      });
    });
  });

  it('auto-heals mismatched persisted yjs state from description', async () => {
    const healedState = createValidYjsState();
    yjsHelperMocks.mockConvertYjsStateToJsonContent.mockReturnValueOnce({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Stale content' }],
        },
      ],
    });
    yjsHelperMocks.mockConvertJsonContentToYjsState.mockReturnValueOnce(
      healedState
    );
    taskApiMocks.mockFetchWorkspaceTaskDescription.mockResolvedValueOnce({
      description: JSON.stringify(description),
      description_yjs_state: [7, 7, 7],
    });
    taskApiMocks.mockUpdateWorkspaceTaskDescription.mockResolvedValueOnce({});

    renderHook(() => useTaskYjsSync(makeProps()));

    await waitFor(() => {
      expect(
        taskApiMocks.mockUpdateWorkspaceTaskDescription
      ).toHaveBeenCalledWith('ws-1', 'task-1', {
        description_yjs_state: Array.from(healedState),
      });
    });
  });

  it('does not rewrite yjs state when persisted state already matches description', async () => {
    yjsHelperMocks.mockConvertYjsStateToJsonContent.mockReturnValueOnce(
      description
    );
    taskApiMocks.mockFetchWorkspaceTaskDescription.mockResolvedValueOnce({
      description: JSON.stringify(description),
      description_yjs_state: [1, 2, 3],
    });

    renderHook(() => useTaskYjsSync(makeProps()));

    await waitFor(() => {
      expect(
        taskApiMocks.mockFetchWorkspaceTaskDescription
      ).toHaveBeenCalledWith('ws-1', 'task-1');
    });

    expect(
      taskApiMocks.mockUpdateWorkspaceTaskDescription
    ).not.toHaveBeenCalled();
  });

  it('does not rewrite yjs state when description payload is null and persisted state exists', async () => {
    const props = makeProps();
    const yjsState = createValidYjsState();

    taskApiMocks.mockFetchWorkspaceTaskDescription.mockResolvedValueOnce({
      description: null,
      description_yjs_state: Array.from(yjsState),
    });

    renderHook(() =>
      useTaskYjsSync({
        ...props,
        description: null,
      })
    );

    await waitFor(() => {
      expect(
        taskApiMocks.mockFetchWorkspaceTaskDescription
      ).toHaveBeenCalledWith('ws-1', 'task-1');
    });

    expect(
      taskApiMocks.mockUpdateWorkspaceTaskDescription
    ).not.toHaveBeenCalled();
    expect(
      yjsHelperMocks.mockConvertJsonContentToYjsState
    ).not.toHaveBeenCalled();
  });
});
