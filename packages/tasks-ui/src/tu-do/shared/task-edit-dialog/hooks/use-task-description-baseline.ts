import type { Editor, JSONContent } from '@tiptap/react';
import { useLayoutEffect, useState } from 'react';

/** Capture the first hydrated editor snapshot, not the potentially stale row projection. */
export function useTaskDescriptionBaseline({
  taskId,
  isOpen,
  isReady,
  editor,
}: {
  taskId?: string;
  isOpen: boolean;
  isReady: boolean;
  editor: Editor | null;
}): JSONContent | undefined {
  const [baseline, setBaseline] = useState<{
    taskId?: string;
    editor: Editor;
    content: JSONContent;
  }>();

  useLayoutEffect(() => {
    if (!isOpen || !isReady || !editor || editor.isDestroyed) {
      setBaseline(undefined);
      return;
    }
    setBaseline((previous) =>
      previous && previous.taskId === taskId && previous.editor === editor
        ? previous
        : { taskId, editor, content: editor.getJSON() }
    );
  }, [taskId, isOpen, isReady, editor]);

  return isOpen &&
    isReady &&
    baseline?.taskId === taskId &&
    baseline?.editor === editor
    ? baseline.content
    : undefined;
}
