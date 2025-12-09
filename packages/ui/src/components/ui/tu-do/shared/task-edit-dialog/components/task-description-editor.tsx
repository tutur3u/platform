'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import { Loader2 } from '@tuturuuu/icons';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { cn } from '@tuturuuu/utils/format';
import type * as Y from 'yjs';
import CursorOverlayWrapper from '../../cursor-overlay-wrapper';
import { RichTextEditor } from '../../../../text-editor/editor';

// Provider type from Yjs collaboration
type HocuspocusProvider = Parameters<typeof RichTextEditor>[0]['yjsProvider'];

export interface TaskDescriptionEditorProps {
  description: JSONContent | null;
  setDescription: (desc: JSONContent | null) => void;
  isOpen: boolean;
  isCreateMode: boolean;
  collaborationMode: boolean;
  isYjsSyncing: boolean;
  wsId: string;
  boardId: string;
  taskId?: string;
  availableLists?: TaskList[];
  queryClient: QueryClient;

  // Refs
  editorRef: React.RefObject<HTMLDivElement | null>;
  richTextEditorRef: React.RefObject<HTMLDivElement | null>;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  lastCursorPositionRef: React.MutableRefObject<number | null>;
  targetEditorCursorRef: React.MutableRefObject<number | null>;
  flushEditorPendingRef: React.MutableRefObject<
    (() => JSONContent | null) | undefined
  >;

  // Yjs
  yjsDoc: Y.Doc | null;
  yjsProvider: HocuspocusProvider;

  // Callbacks
  onImageUpload: (file: File) => Promise<string>;
  onEditorReady: (editor: Editor) => void;
}

export function TaskDescriptionEditor({
  description,
  setDescription,
  isOpen,
  isCreateMode,
  collaborationMode,
  isYjsSyncing,
  wsId,
  boardId,
  taskId,
  availableLists,
  queryClient,
  editorRef,
  richTextEditorRef,
  titleInputRef,
  lastCursorPositionRef,
  targetEditorCursorRef,
  flushEditorPendingRef,
  yjsDoc,
  yjsProvider,
  onImageUpload,
  onEditorReady,
}: TaskDescriptionEditorProps) {
  const allowCollaboration = isOpen && !isCreateMode && collaborationMode;

  return (
    <div ref={editorRef} className="relative">
      <div
        ref={richTextEditorRef}
        className={cn(
          'relative transition-opacity duration-300',
          isYjsSyncing ? 'opacity-50' : 'opacity-100'
        )}
      >
        <RichTextEditor
          content={description}
          onChange={setDescription}
          writePlaceholder="Add a detailed description, attach files, or use markdown..."
          titlePlaceholder=""
          className="min-h-[calc(100vh-16rem)] border-0 bg-transparent px-4 focus-visible:outline-0 focus-visible:ring-0 md:px-8"
          workspaceId={wsId || undefined}
          onImageUpload={onImageUpload}
          flushPendingRef={flushEditorPendingRef}
          initialCursorOffset={targetEditorCursorRef.current}
          onEditorReady={onEditorReady}
          boardId={boardId}
          availableLists={availableLists}
          queryClient={queryClient}
          onArrowUp={(cursorOffset) => {
            // Focus the title input when pressing arrow up at the start
            if (titleInputRef.current) {
              titleInputRef.current.focus();

              // Apply smart cursor positioning
              if (cursorOffset !== undefined) {
                const textLength = titleInputRef.current.value.length;
                // Use the stored position from last down arrow, or the offset from editor
                const targetPosition =
                  lastCursorPositionRef.current ??
                  Math.min(cursorOffset, textLength);
                titleInputRef.current.setSelectionRange(
                  targetPosition,
                  targetPosition
                );
                // Clear the stored position after use
                lastCursorPositionRef.current = null;
              }
            }
          }}
          onArrowLeft={() => {
            // Focus the title input at the end when pressing arrow left at the start
            if (titleInputRef.current) {
              titleInputRef.current.focus();
              // Set cursor to the end of the input
              const length = titleInputRef.current.value.length;
              titleInputRef.current.setSelectionRange(length, length);
            }
          }}
          yjsDoc={allowCollaboration ? yjsDoc : null}
          yjsProvider={allowCollaboration ? yjsProvider : null}
          allowCollaboration={allowCollaboration}
          editable={!isYjsSyncing}
        />

        {/* Collaboration sync indicator - shows while Yjs is syncing */}
        {isYjsSyncing && (
          <div className="pointer-events-none absolute top-4 right-4 flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm md:right-8">
            <Loader2 className="h-4 w-4 animate-spin text-dynamic-yellow" />
            <p className="text-muted-foreground text-xs">
              Syncing collaboration state...
            </p>
          </div>
        )}

        {allowCollaboration && taskId && (
          <CursorOverlayWrapper
            channelName={`editor-cursor-${taskId}`}
            containerRef={richTextEditorRef}
          />
        )}
      </div>
    </div>
  );
}
