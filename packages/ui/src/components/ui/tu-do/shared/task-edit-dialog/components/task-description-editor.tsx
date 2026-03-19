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
import { getTaskDescriptionStorageLength } from '../utils';

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
  onDescriptionStorageLengthChange: (storageLength: number) => void;
  descriptionStorageLength: number;
  descriptionPercentLeft: number;
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
  onDescriptionStorageLengthChange,
  descriptionStorageLength,
  descriptionPercentLeft,
  descriptionLimit,
  isDescriptionOverLimit,
  mentionTranslations,
  disabled = false,
}: TaskDescriptionEditorProps) {
  const t = useTranslations('ws-task-boards.dialog');
  const progressPercent = isDescriptionOverLimit
    ? 100
    : Math.max(0, Math.min(100, 100 - descriptionPercentLeft));
  const circleRadius = 14;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const circleOffset =
    circleCircumference - (progressPercent / 100) * circleCircumference;
  const indicatorToneClass = isDescriptionOverLimit
    ? 'text-destructive'
    : descriptionStorageLength >= descriptionLimit * 0.85
      ? 'text-dynamic-yellow'
      : 'text-dynamic-green';
  const indicatorStrokeClass = isDescriptionOverLimit
    ? 'stroke-destructive'
    : descriptionStorageLength >= descriptionLimit * 0.85
      ? 'stroke-dynamic-yellow'
      : 'stroke-dynamic-green';
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
          onImmediateChange={(nextDescription) => {
            onDescriptionStorageLengthChange(
              getTaskDescriptionStorageLength(nextDescription)
            );
          }}
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

        <div className="fixed right-4 bottom-20 z-20 md:right-8 md:bottom-6">
          <div
            className={cn(
              'group relative rounded-full border bg-background/90 p-1 shadow-lg backdrop-blur-sm transition-colors',
              isDescriptionOverLimit
                ? 'border-destructive/40'
                : descriptionStorageLength >= descriptionLimit * 0.85
                  ? 'border-dynamic-yellow/40'
                  : 'border-border/70'
            )}
          >
            <div className="relative flex h-10 w-10 items-center justify-center">
              <svg
                className="h-10 w-10 -rotate-90"
                viewBox="0 0 36 36"
                aria-hidden="true"
              >
                <circle
                  className="stroke-border/60"
                  cx="18"
                  cy="18"
                  r={circleRadius}
                  fill="none"
                  strokeWidth="3"
                />
                <circle
                  className={cn(
                    'transition-all duration-200',
                    indicatorStrokeClass
                  )}
                  cx="18"
                  cy="18"
                  r={circleRadius}
                  fill="none"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circleCircumference}
                  strokeDashoffset={circleOffset}
                />
              </svg>
              <span
                className={cn(
                  'absolute inset-0 flex items-center justify-center font-medium text-[10px] tabular-nums',
                  indicatorToneClass
                )}
              >
                {descriptionPercentLeft}%
              </span>
            </div>

            <div
              className={cn(
                'pointer-events-none absolute right-0 bottom-12 w-[min(70vw,20rem)] translate-y-1 rounded-lg border bg-background/95 p-2 opacity-0 shadow-md backdrop-blur-sm transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100',
                isDescriptionOverLimit
                  ? 'border-destructive/40'
                  : descriptionStorageLength >= descriptionLimit * 0.85
                    ? 'border-dynamic-yellow/40'
                    : 'border-border/70'
              )}
            >
              <p
                className={cn(
                  'mb-1 text-xs transition-colors',
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
                        percent: descriptionPercentLeft,
                      })
                    : t('description_storage_helper')}
              </p>
              <p
                className={cn(
                  'text-right font-medium text-xs',
                  indicatorToneClass
                )}
              >
                {t('description_storage_counter', {
                  percent: descriptionPercentLeft,
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
