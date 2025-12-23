'use client';

import DragHandle from '@tiptap/extension-drag-handle-react';
import type { Editor } from '@tiptap/react';
import { GripVertical } from '@tuturuuu/icons';
import { useState } from 'react';

interface EditorDragHandleProps {
  editor: Editor | null;
}

/**
 * Drag handle component for the editor.
 * Provides a draggable handle that appears on the left side of blocks.
 * Automatically hides for list items and lists which have their own custom drag handles.
 */
export function EditorDragHandle({ editor }: EditorDragHandleProps) {
  const [shouldShowDefaultDragHandle, setShouldShowDefaultDragHandle] =
    useState(true);

  if (!editor) {
    return null;
  }

  return (
    <DragHandle
      editor={editor}
      computePositionConfig={{
        placement: 'left',
        strategy: 'fixed',
      }}
      onNodeChange={({ node }) => {
        // Don't show default drag handle for list items and list containers
        // They have their own custom drag handles
        const excludedTypes = [
          'listItem',
          'taskItem',
          'bulletList',
          'orderedList',
          'taskList',
        ];
        const shouldShow = !excludedTypes.includes(node?.type.name ?? '');
        setShouldShowDefaultDragHandle(shouldShow);
      }}
    >
      <div
        className={`size-5 cursor-grab items-center justify-center text-muted-foreground transition-colors hover:text-foreground ${
          shouldShowDefaultDragHandle ? 'flex' : 'hidden'
        }`}
      >
        <GripVertical />
      </div>
    </DragHandle>
  );
}
