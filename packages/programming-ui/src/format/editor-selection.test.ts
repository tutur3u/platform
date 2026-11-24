import { afterEach, expect, it, vi } from 'vitest';
import { selectionHandle } from './editor-selection';

afterEach(() => vi.useRealTimers());

function fakeEditor(initial: string) {
  let value = initial;
  const listeners = new Set<() => void>();
  const setSelection = vi.fn();
  const model = {
    getValue: () => value,
    getOffsetAt: ({
      lineNumber,
      column,
    }: {
      lineNumber: number;
      column: number;
    }) => {
      const lines = value.split('\n');
      return (
        lines
          .slice(0, lineNumber - 1)
          .reduce((sum, line) => sum + line.length + 1, 0) +
        column -
        1
      );
    },
    getPositionAt: (offset: number) => {
      const before = value.slice(0, offset).split('\n');
      return { lineNumber: before.length, column: before.at(-1)!.length + 1 };
    },
  };
  const editor = {
    getModel: () => model,
    getSelection: () => ({
      getStartPosition: () => ({ lineNumber: 2, column: 4 }),
      getEndPosition: () => ({ lineNumber: 2, column: 6 }),
    }),
    setSelection,
    revealPositionInCenterIfOutsideViewport: vi.fn(),
    onDidChangeModelContent: (listener: () => void) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
  };
  return {
    editor: editor as never,
    setSelection,
    show: (next: string) => {
      value = next;
      for (const listener of [...listeners]) listener();
    },
    listeners,
  };
}

it('reads the selection as offsets into the file', () => {
  const { editor } = fakeEditor('ab\nfoo()\n');
  expect(selectionHandle(editor).getSelection()).toEqual({
    anchor: 6,
    head: 8,
  });
});

it('restores at once when the editor already shows the formatted text', () => {
  const { editor, setSelection } = fakeEditor('ab\nfoo()\n');
  selectionHandle(editor).setSelection({ anchor: 3, head: 3 }, 'ab\nfoo()\n');
  expect(setSelection).toHaveBeenCalledWith({
    selectionStartLineNumber: 2,
    selectionStartColumn: 1,
    positionLineNumber: 2,
    positionColumn: 1,
  });
});

it('waits for the formatted text to reach the editor, then restores once', () => {
  const { editor, setSelection, show, listeners } = fakeEditor('old\n');
  selectionHandle(editor).setSelection({ anchor: 4, head: 4 }, 'new!\n');
  expect(setSelection).not.toHaveBeenCalled();
  show('half\n');
  expect(setSelection).not.toHaveBeenCalled();
  show('new!\n');
  expect(setSelection).toHaveBeenCalledTimes(1);
  expect(listeners.size).toBe(0);
});

it('gives up quietly if the text never arrives', () => {
  vi.useFakeTimers();
  const { editor, setSelection, listeners } = fakeEditor('old\n');
  selectionHandle(editor).setSelection({ anchor: 0, head: 0 }, 'new\n');
  vi.advanceTimersByTime(2000);
  expect(listeners.size).toBe(0);
  expect(setSelection).not.toHaveBeenCalled();
});
