import { act, renderHook } from '@testing-library/react';
import type { JSONContent } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import { useTaskDescriptionReceipt } from './use-task-description-receipt';

describe('confirmed task description receipts', () => {
  const saved: JSONContent = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
  };
  const initial = { isOpen: true, taskId: 'a', wsId: 'workspace' };
  it('exposes only confirmed saves from the current opening', () => {
    const { result, rerender } = renderHook(useTaskDescriptionReceipt, {
      initialProps: initial,
    });
    expect(result.current.confirmedSavedContent).toBeUndefined();
    act(() => result.current.confirmSavedDescription(saved));
    expect(result.current.confirmedSavedContent).toBe(saved);
    rerender({ ...initial, isOpen: false });
    rerender(initial);
    expect(result.current.confirmedSavedContent).toBeUndefined();
  });
  it('rejects a late old-opening receipt after reopening, task or workspace switches', () => {
    const { result, rerender } = renderHook(useTaskDescriptionReceipt, {
      initialProps: initial,
    });
    const oldConfirm = result.current.confirmSavedDescription;
    rerender({ ...initial, isOpen: false });
    rerender(initial);
    act(() => result.current.confirmSavedDescription(saved));
    act(() => oldConfirm({ type: 'doc', content: [] }));
    expect(result.current.confirmedSavedContent).toBe(saved);
    const reopenedConfirm = result.current.confirmSavedDescription;
    rerender({ ...initial, taskId: 'b', wsId: 'other' });
    act(() => reopenedConfirm(saved));
    expect(result.current.confirmedSavedContent).toBeUndefined();
  });
});
