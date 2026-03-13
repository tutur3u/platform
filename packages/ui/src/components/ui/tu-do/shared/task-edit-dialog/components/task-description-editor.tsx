'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import { Loader2 } from '@tuturuuu/icons';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import { RichTextEditor } from '../../../../text-editor/editor';
import { fetchWorkspaceTask, updateWorkspaceTask } from '../hooks/task-api';

// Provider type from Yjs collaboration
type HocuspocusProvider = Parameters<typeof RichTextEditor>[0]['yjsProvider'];

export interface TaskDescriptionEditorProps {
  description: JSONContent | null;
  setDescription: (desc: JSONContent | null) => void;
  isOpen: boolean;
  isCreateMode: boolean;
  /** Whether cursor collaboration is enabled (paid tiers only) */
  collaborationMode: boolean;
  /** Whether realtime features (Yjs sync) are enabled - true for all tiers */
  realtimeEnabled?: boolean;
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
  lastCursorPositionRef: React.RefObject<number | null>;
  targetEditorCursorRef: React.RefObject<number | null>;
  flushEditorPendingRef: React.RefObject<
    (() => JSONContent | null) | undefined
  >;

  // Yjs
  yjsDoc: Y.Doc | null;
  yjsProvider: HocuspocusProvider;
  /** User info for collaboration cursor labels. */
  collaborationUser: { name: string; color: string } | null;

  // Callbacks
  onImageUpload: (file: File) => Promise<string>;
  onEditorReady: (editor: Editor) => void;
  descriptionStorageLength: number;
  descriptionLimit: number;
  isDescriptionOverLimit: boolean;

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
  realtimeEnabled = false,
  isYjsSyncing,
  wsId,
  boardId,
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
  collaborationUser,
  onImageUpload,
  onEditorReady,
  descriptionStorageLength,
  descriptionLimit,
  isDescriptionOverLimit,
  mentionTranslations,
  disabled = false,
}: TaskDescriptionEditorProps) {
  const t = useTranslations('ws-task-boards.dialog');
  // Yjs sync is enabled for all tiers (realtimeEnabled), but cursor labels only for paid tiers (collaborationMode)
  const allowYjsSync = isOpen && !isCreateMode && realtimeEnabled;
  const showCollaborationCursors = isOpen && !isCreateMode && collaborationMode;

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
          const { task } = await fetchWorkspaceTask(wsId, taskId);

          if (task?.deleted_at) {
            await updateWorkspaceTask(wsId, taskId, { deleted: false });
            queryClient.invalidateQueries({ queryKey: ['task', taskId] });
            if (task.board_id) {
              queryClient.invalidateQueries({
                queryKey: ['tasks', task.board_id],
              });
            }

            toast.info(t('task_restored'), {
              description: t('task_restored_description', {
                name: task.name || `#${taskId.slice(0, 8)}`,
              }),
            });
          }
        } catch (error) {
          console.error(`Failed to restore task ${taskId}:`, error);
        }
      }

      // Handle removed mentions (redo deletion - re-delete the task)
      for (const taskId of removedMentions) {
        try {
          const { task } = await fetchWorkspaceTask(wsId, taskId);

          // Only re-delete if task is not already deleted
          if (task && !task.deleted_at) {
            await updateWorkspaceTask(wsId, taskId, { deleted: true });
            queryClient.invalidateQueries({ queryKey: ['task', taskId] });
            if (task.board_id) {
              queryClient.invalidateQueries({
                queryKey: ['tasks', task.board_id],
              });
            }

            toast.info(t('task_deleted'), {
              description: t('task_deleted_description', {
                name: task.name || `#${taskId.slice(0, 8)}`,
              }),
            });
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
  }, [isCreateMode, queryClient, t, wsId]);

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
          writePlaceholder={t('description_placeholder')}
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
          yjsDoc={allowYjsSync && yjsDoc ? yjsDoc : undefined}
          yjsProvider={allowYjsSync && yjsProvider ? yjsProvider : undefined}
          collaborationUser={
            showCollaborationCursors && collaborationUser
              ? collaborationUser
              : undefined
          }
          allowCollaboration={allowYjsSync}
          readOnly={isYjsSyncing || disabled}
          mentionTranslations={mentionTranslations}
        />

        {/* Collaboration sync indicator - shows while Yjs is syncing */}
        {isYjsSyncing && (
          <div className="pointer-events-none absolute top-4 right-4 flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm md:right-8">
            <Loader2 className="h-4 w-4 animate-spin text-dynamic-yellow" />
            <p className="text-muted-foreground text-xs">
              {t('syncing_collaboration_state')}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-border/60 border-t px-4 py-3 md:px-8">
        <p
          className={cn(
            'text-xs transition-colors',
            isDescriptionOverLimit
              ? 'text-destructive'
              : descriptionStorageLength >= descriptionLimit * 0.85
                ? 'text-dynamic-yellow'
                : 'text-muted-foreground'
          )}
        >
          {isDescriptionOverLimit
            ? t('description_storage_over_limit', {
                max: descriptionLimit,
              })
            : descriptionStorageLength >= descriptionLimit * 0.85
              ? t('description_storage_warning', {
                  remaining: descriptionLimit - descriptionStorageLength,
                })
              : t('description_storage_helper')}
        </p>
        <div
          className={cn(
            'rounded-full border px-3 py-1 font-medium text-xs tabular-nums transition-colors',
            isDescriptionOverLimit
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : descriptionStorageLength >= descriptionLimit * 0.85
                ? 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow'
                : 'border-border/60 bg-muted/40 text-muted-foreground'
          )}
        >
          {t('description_storage_counter', {
            count: descriptionStorageLength,
            max: descriptionLimit,
          })}
        </div>
      </div>
    </div>
  );
}
