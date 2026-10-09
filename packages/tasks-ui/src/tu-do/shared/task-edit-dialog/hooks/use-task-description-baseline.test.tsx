import { renderHook } from '@testing-library/react';
import type { Editor, JSONContent } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';
import { useTaskDescriptionBaseline } from './use-task-description-baseline';

const content = (text: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('hydrated description baseline', () => {
  it('waits for hydration, preserves the original baseline during edits, and resets on reopen', () => {
    const getJSON = vi.fn(() => content('Durable Yjs version'));
    const editor = { getJSON, isDestroyed: false } as unknown as Editor;
    const initial = { taskId: 'a', isOpen: true, isReady: false, editor };
    const { result, rerender } = renderHook(useTaskDescriptionBaseline, {
      initialProps: initial,
    });
    expect(result.current).toBeUndefined();
    expect(getJSON).not.toHaveBeenCalled();
    rerender({ ...initial, isReady: true });
    expect(result.current).toEqual(content('Durable Yjs version'));
    getJSON.mockReturnValue(content('Unsaved edit'));
    rerender({ ...initial, isReady: true });
    expect(result.current).toEqual(content('Durable Yjs version'));
    expect(getJSON).toHaveBeenCalledTimes(1);
    rerender({ ...initial, isOpen: false });
    expect(result.current).toBeUndefined();
    getJSON.mockReturnValue(content('Fresh reopened version'));
    rerender({ ...initial, isReady: true });
    expect(result.current).toEqual(content('Fresh reopened version'));
  });

  it('does not reuse another task/editor baseline or capture a destroyed editor', () => {
    const editor = {
      getJSON: vi.fn(() => content('a')),
      isDestroyed: false,
    } as unknown as Editor;
    const initial = { taskId: 'a', isOpen: true, isReady: true, editor };
    const { result, rerender } = renderHook(useTaskDescriptionBaseline, {
      initialProps: initial,
    });
    const nextEditor = {
      getJSON: vi.fn(() => content('b')),
      isDestroyed: false,
    } as unknown as Editor;
    rerender({ ...initial, taskId: 'b', editor: nextEditor });
    expect(result.current).toEqual(content('b'));
    const destroyed = {
      getJSON: vi.fn(),
      isDestroyed: true,
    } as unknown as Editor;
    rerender({ ...initial, taskId: 'c', editor: destroyed });
    expect(result.current).toBeUndefined();
    expect(destroyed.getJSON).not.toHaveBeenCalled();
  });
});
