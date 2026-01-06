'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import { Loader2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import { RichTextEditor } from '../../../../text-editor/editor';
import CursorOverlayWrapper from '../../cursor-overlay-wrapper';

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

  /** Translations for mention chip dialogs */
  mentionTranslations?: {
    delete_task?: string;
    delete_task_confirmation?: string | ((name: string) => string);
    cancel?: string;
    deleting?: string;
    set_custom_due_date?: string;
    custom_due_date_description?: string;
    remove_due_date?: string;
    create_new_label?: string;
    create_new_label_description?: string;
    label_name?: string;
    color?: string;
    preview?: string;
    creating?: string;
    create_label?: string;
    create_new_project?: string;
    create_new_project_description?: string;
    project_name?: string;
    create_project?: string;
  };
  disabled?: boolean;
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
  mentionTranslations,
  disabled = false,
}: TaskDescriptionEditorProps) {
  const allowCollaboration = isOpen && !isCreateMode && collaborationMode;
  const supabase = createClient();

  // Track mention changes to detect undo/redo operations and sync with database
  const previousMentionedTaskIdsRef = useRef<Set<string>>(new Set());
  const editorInstanceRef = useRef<Editor | null>(null);

  // Store editor instance when it becomes available
  const handleEditorReady = (editor: Editor) => {
    editorInstanceRef.current = editor;
    onEditorReady(editor);

    // Initialize previous mentions
    const mentionedTaskIds = new Set<string>();
    editor.state.doc.descendants((node) => {
      if (
        node.type.name === 'mention' &&
        node.attrs.entityType === 'task' &&
        node.attrs.entityId
      ) {
        mentionedTaskIds.add(node.attrs.entityId);
      }
    });
    previousMentionedTaskIdsRef.current = mentionedTaskIds;
  };

  // Monitor editor updates for undo/redo detection
  useEffect(() => {
    const editor = editorInstanceRef.current;
    if (!editor || isCreateMode) return;

    const handleUpdate = async ({
      editor,
      transaction,
    }: {
      editor: Editor;
      transaction: any;
    }) => {
      // Skip if this is just a selection change
      if (!transaction.docChanged) return;

      // Collect current mentions
      const currentMentionedTaskIds = new Set<string>();
      editor.state.doc.descendants((node) => {
        if (
          node.type.name === 'mention' &&
          node.attrs.entityType === 'task' &&
          node.attrs.entityId
        ) {
          currentMentionedTaskIds.add(node.attrs.entityId);
        }
      });

      // Find newly added mentions (potential undo restoration)
      const addedMentions = [...currentMentionedTaskIds].filter(
        (id) => !previousMentionedTaskIdsRef.current.has(id)
      );

      // Find removed mentions (potential redo deletion)
      const removedMentions = [...previousMentionedTaskIdsRef.current].filter(
        (id) => !currentMentionedTaskIds.has(id)
      );

      // Handle restored mentions (undo operation)
      for (const taskId of addedMentions) {
        try {
          const { data: task } = await supabase
            .from('tasks')
            .select('id, deleted_at, name, board_id')
            .eq('id', taskId)
            .maybeSingle();

          if (task?.deleted_at) {
            // Restore the task
            const { error } = await supabase
              .from('tasks')
              .update({ deleted_at: null })
              .eq('id', taskId);

            if (!error) {
              // Update caches
              queryClient.invalidateQueries({ queryKey: ['task', taskId] });
              if (task.board_id) {
                queryClient.invalidateQueries({
                  queryKey: ['tasks', task.board_id],
                });
              }

              toast.info('Task restored', {
                description: `"${task.name || `#${taskId.slice(0, 8)}`}" was restored due to undo operation`,
              });
            }
          }
        } catch (error) {
          console.error(`Failed to restore task ${taskId}:`, error);
        }
      }

      // Handle removed mentions (redo deletion - re-delete the task)
      for (const taskId of removedMentions) {
        try {
          const { data: task } = await supabase
            .from('tasks')
            .select('id, deleted_at, name, board_id')
            .eq('id', taskId)
            .maybeSingle();

          // Only re-delete if task is not already deleted
          if (task && !task.deleted_at) {
            const { error } = await supabase
              .from('tasks')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', taskId);

            if (!error) {
              // Update caches
              queryClient.invalidateQueries({ queryKey: ['task', taskId] });
              if (task.board_id) {
                queryClient.invalidateQueries({
                  queryKey: ['tasks', task.board_id],
                });
              }

              toast.info('Task deleted', {
                description: `"${task.name || `#${taskId.slice(0, 8)}`}" was deleted due to redo operation`,
              });
            }
          }
        } catch (error) {
          console.error(`Failed to re-delete task ${taskId}:`, error);
        }
      }

      // Update previous state for next comparison
      previousMentionedTaskIdsRef.current = currentMentionedTaskIds;
    };

    editor.on('update', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
    };
  }, [isCreateMode, queryClient, supabase]);

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
          onEditorReady={handleEditorReady}
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
          readOnly={isYjsSyncing || disabled}
          mentionTranslations={mentionTranslations}
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
