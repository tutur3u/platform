'use client';

import type { QueryClient } from '@tanstack/react-query';
import { TextSelection } from '@tiptap/pm/state';
import {
  type Editor,
  EditorContent,
  type JSONContent,
  useEditor,
} from '@tiptap/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type SupabaseProvider from '@tuturuuu/ui/hooks/supabase-provider';
import { debounce } from 'lodash';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type * as Y from 'yjs';
import { migrateInlineImagesToBlock } from './content-migration';
import type { EditorCopyLabels } from './copy-menu';
import { getRichTextEditorClasses } from './editor-classes';
import { getEditorExtensions } from './extensions';
import { handleListIndentation, handlePlainEnterFallback } from './keyboard';
import type { TaskMentionNodeViewRenderer } from './mention-extension';
import { FixedToolbar, ToolBar } from './tool-bar';

const hasContent = (node: JSONContent): boolean => {
  // Check for text content
  if (node.text && node.text.trim().length > 0) return true;

  // Check for media content (images, videos, YouTube embeds, tables, etc.)
  if (
    node.type &&
    ['image', 'imageResize', 'youtube', 'video', 'mention', 'table'].includes(
      node.type
    )
  ) {
    return true;
  }

  // Recursively check children
  if (node.content && node.content.length > 0) {
    return node.content.some((child: JSONContent) => hasContent(child));
  }

  // Empty paragraphs or empty doc should return false
  return false;
};

function syncEditorContent(editor: Editor, nextContent: JSONContent | null) {
  const migratedContent = migrateInlineImagesToBlock(nextContent);
  const currentContent = editor.getJSON();
  const contentChanged =
    JSON.stringify(currentContent) !== JSON.stringify(migratedContent);

  if (contentChanged) {
    editor.commands.setContent(
      migratedContent || { type: 'doc', content: [] },
      {
        emitUpdate: false,
      }
    );
  }
}

/**
 * Hides the formatting toolbar until focus lands inside the editor. Scoped to the
 * `group` wrapper below so focus on a toolbar button keeps it visible — otherwise
 * the toolbar would disappear on mousedown, before the click could land.
 */
export const REVEAL_TOOLBAR_ON_FOCUS_CLASS_NAME =
  'pointer-events-none opacity-0 transition-opacity duration-200 group-focus-within:pointer-events-auto group-focus-within:opacity-100';

function serializeEditorContent(content: JSONContent | null) {
  return JSON.stringify(content ?? { type: 'doc', content: [] });
}

export interface RichTextEditorProps {
  content: JSONContent | null;
  onChange?: (content: JSONContent | null) => void;
  onImmediateChange?: (content: JSONContent | null) => void;
  readOnly?: boolean;
  titlePlaceholder?: string;
  writePlaceholder?: string;
  saveButtonLabel?: string;
  savedButtonLabel?: string;
  className?: string;
  workspaceId?: string;
  onImageUpload?: (file: File) => Promise<string>;
  flushPendingRef?: { current: (() => JSONContent | null) | undefined };
  onArrowUp?: (cursorOffset?: number) => void;
  onArrowLeft?: () => void;
  editorRef?: { current: Editor | null };
  initialCursorOffset?: number | null;
  onEditorReady?: (editor: Editor) => void;
  yjsDoc?: Y.Doc;
  yjsProvider?: SupabaseProvider;
  /** User info for collaboration cursor labels. */
  collaborationUser?: { id?: string; name: string; color: string };
  boardId?: string;
  availableLists?: TaskList[];
  queryClient?: QueryClient;
  onConvertToTask?: () => void | Promise<void>;
  allowCollaboration?: boolean;
  /**
   * Keep the formatting toolbar transparent until focus is somewhere inside the
   * editor, so a read-first surface (like the task dialog) is not fronted by a
   * row of controls. Focus-within — not editor focus — because clicking a
   * toolbar button moves focus out of the text and would otherwise hide the
   * toolbar mid-click.
   */
  revealToolbarOnFocus?: boolean;
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
  renderTaskMention?: TaskMentionNodeViewRenderer;
  toolbarLeadingContent?: React.ReactNode;
  toggleBlockLabel?: string;
  copyLabels?: EditorCopyLabels;
}

export function RichTextEditor({
  content,
  onChange,
  onImmediateChange,
  readOnly = false,
  titlePlaceholder = 'What is the title?',
  writePlaceholder = 'Write something...',
  saveButtonLabel,
  savedButtonLabel,
  className,
  workspaceId,
  onImageUpload,
  flushPendingRef,
  onArrowUp,
  onArrowLeft,
  editorRef: externalEditorRef,
  initialCursorOffset,
  onEditorReady,
  onConvertToTask,
  yjsDoc,
  yjsProvider,
  collaborationUser,
  allowCollaboration = false,
  revealToolbarOnFocus = false,
  mentionTranslations,
  renderTaskMention,
  toolbarLeadingContent,
  toggleBlockLabel,
  copyLabels,
}: RichTextEditorProps) {
  // Use refs to ensure we have stable references for handlers
  const onImageUploadRef = useRef(onImageUpload);
  const workspaceIdRef = useRef(workspaceId);
  const onChangeRef = useRef(onChange);
  const onImmediateChangeRef = useRef(onImmediateChange);
  const onArrowUpRef = useRef(onArrowUp);
  const onArrowLeftRef = useRef(onArrowLeft);
  const debouncedOnChangeRef = useRef<ReturnType<typeof debounce> | null>(null);
  // Track when we're in a programmatic update to skip content sync
  const isProgrammaticUpdateRef = useRef(false);
  const hasDeferredExternalContentRef = useRef(false);
  const deferredExternalContentRef = useRef<JSONContent | null>(null);
  const deferredEditorSnapshotRef = useRef<string | null>(null);
  const getDelegatedImageUpload = useCallback(
    () => onImageUploadRef.current,
    []
  );

  // Collaboration bindings decide which extensions the editor is built with, and
  // `Editor.setOptions({ extensions })` does NOT rebuild the extension manager —
  // it only refreshes editor props. So a binding change has to recreate the
  // editor through `useEditor`'s dependency array. Without this, an editor first
  // created while collaboration was still off (e.g. a task dialog opened from a
  // deep link, which mounts before the task has hydrated) never gains the
  // Collaboration extension, and content that lives only in the Yjs document can
  // never render.
  //
  // ONLY the document binding belongs in that dependency array. The Yjs document
  // is what the content lives in, so getting it wrong is a correctness bug worth
  // a rebuild. The provider only feeds CollaborationCaret (remote cursor labels),
  // which is cosmetic and normally already attached because the provider exists
  // before this subtree mounts — rebuilding a live editor for it would tear down
  // the ProseMirror view (losing selection and scroll position) and re-run the
  // Yjs binding over the whole document mid-session, which on a large document is
  // an expensive, user-visible hiccup for no content benefit.
  const collaborationDoc = allowCollaboration ? yjsDoc : undefined;
  const collaborationProvider = allowCollaboration ? yjsProvider : undefined;

  useEffect(() => {
    onImageUploadRef.current = onImageUpload;
    workspaceIdRef.current = workspaceId;
    onChangeRef.current = onChange;
    onImmediateChangeRef.current = onImmediateChange;
    onArrowUpRef.current = onArrowUp;
    onArrowLeftRef.current = onArrowLeft;
  }, [
    onImageUpload,
    workspaceId,
    onChange,
    onImmediateChange,
    onArrowUp,
    onArrowLeft,
  ]);

  const debouncedOnChange = useMemo(
    () =>
      debounce((newContent: JSONContent) => {
        onChangeRef.current?.(hasContent(newContent) ? newContent : null);
      }, 500),
    []
  );

  // Store debounced function ref for flushing
  useEffect(() => {
    debouncedOnChangeRef.current = debouncedOnChange;
  }, [debouncedOnChange]);

  useEffect(() => {
    return () => {
      debouncedOnChange.cancel();
    };
  }, [debouncedOnChange]);

  const getEditorClasses = useMemo(
    () => getRichTextEditorClasses({ className, readOnly }),
    [className, readOnly]
  );

  const editor = useEditor(
    {
      extensions: getEditorExtensions({
        titlePlaceholder,
        writePlaceholder,
        doc: collaborationDoc,
        provider: collaborationProvider,
        collaborationUser: allowCollaboration ? collaborationUser : undefined,
        onImageUpload,
        onVideoUpload: onImageUpload,
        getOnImageUpload: getDelegatedImageUpload,
        getOnVideoUpload: getDelegatedImageUpload,
        mentionTranslations,
        renderTaskMention,
        readOnly,
      }),
      // Migrate inline images to block-level for backward compatibility
      content: allowCollaboration
        ? undefined
        : migrateInlineImagesToBlock(content),
      editable: !readOnly,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: getEditorClasses,
        },
        handleKeyDown: (view, event) => {
          // Prevent Ctrl+Enter / Cmd+Enter from creating a new line
          // Let the parent component handle the save action
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            return true;
          }

          if (handlePlainEnterFallback(view, event)) {
            return true;
          }

          const { state, dispatch } = view;
          const { selection } = state;
          const { $from } = selection;

          // Handle Backspace
          if (event.key === 'Backspace' && onArrowUpRef.current) {
            // If there's a text selection, let default behavior handle deletion
            if (!selection.empty) {
              return false;
            }

            console.log('Backspace at pos:', $from.pos);

            // Check if we're on the first line
            const coordsAtCursor = view.coordsAtPos($from.pos);
            const coordsAtStart = view.coordsAtPos(1);
            const isOnFirstLine =
              coordsAtCursor &&
              coordsAtStart &&
              Math.abs(coordsAtCursor.top - coordsAtStart.top) < 5;

            console.log('Is on first line:', isOnFirstLine);

            if (isOnFirstLine) {
              const firstChild = state.doc.firstChild;
              console.log('First child:', {
                type: firstChild?.type.name,
                text: firstChild?.textContent,
                isEmpty: firstChild?.textContent.trim() === '',
                nodeSize: firstChild?.nodeSize,
              });

              // If cursor is at the absolute start (position 1)
              if ($from.pos === 1) {
                const firstChild = state.doc.firstChild;

                // If first line is empty and there's a second line, delete the empty line
                if (firstChild && firstChild.textContent.trim() === '') {
                  const secondChild = state.doc.maybeChild(1);
                  if (secondChild) {
                    console.log(
                      'Empty first line - manually deleting via commands'
                    );
                    event.preventDefault();

                    // Use commands to delete the node
                    const tr = state.tr;
                    const nodeSize = firstChild.nodeSize;

                    // Delete from position 0 to end of first child (including the node itself)
                    tr.delete(0, nodeSize);

                    // Dispatch and trigger onChange manually
                    dispatch(tr);

                    // Manually trigger onChange since we're in handleKeyDown
                    if (!readOnly && onChangeRef.current) {
                      const newJson = tr.doc.toJSON();
                      onChangeRef.current(hasContent(newJson) ? newJson : null);
                    }

                    return true;
                  }
                }

                // If first line is NOT empty, go to title
                console.log('Non-empty first line - going to title');
                event.preventDefault();
                onArrowUpRef.current();
                return true;
              }
            }
          }

          // Handle ArrowUp when on the first line
          if (event.key === 'ArrowUp' && onArrowUpRef.current) {
            // Try to resolve a position one line up by checking textBetween
            // If we're at the very start of the document (pos 1), go to title
            if ($from.pos === 1) {
              event.preventDefault();
              onArrowUpRef.current(0); // At the start, offset is 0
              return true;
            }

            // Check if we're in a position where up arrow won't move us
            // This happens when we're on the first line of the first block
            const coordsAtCursor = view.coordsAtPos($from.pos);
            const coordsAtStart = view.coordsAtPos(1);

            // If cursor is on the same line as the start, go to title
            if (
              coordsAtCursor &&
              coordsAtStart &&
              Math.abs(coordsAtCursor.top - coordsAtStart.top) < 5
            ) {
              event.preventDefault();

              // Calculate character offset from start of the first line
              // Position 1 is the start of the document, $from.pos is current cursor
              // Since we're on the first line, the offset is simply the distance from position 1
              const offset = $from.pos - 1;

              onArrowUpRef.current(offset);
              return true;
            }
          }

          // Handle ArrowLeft when at the very start of the document
          if (event.key === 'ArrowLeft' && onArrowLeftRef.current) {
            // If we're at position 1 (start of document), go back to title
            if ($from.pos === 1) {
              event.preventDefault();
              onArrowLeftRef.current();
              return true;
            }
          }

          if (handleListIndentation(view, event)) return true;

          return false;
        },
      },
      onCreate: ({ editor }) => {
        if (externalEditorRef) {
          externalEditorRef.current = editor;
        }
        onEditorReady?.(editor);
      },
      onUpdate: ({ editor }) => {
        const currentJson = editor.getJSON();
        const normalizedContent = hasContent(currentJson) ? currentJson : null;

        if (!readOnly) {
          onImmediateChangeRef.current?.(normalizedContent);
        }

        // Don't call onChange when using collaboration - Yjs doc is the source of truth
        if (!readOnly && !allowCollaboration) {
          debouncedOnChange(currentJson);
        }
      },
      // Rebuild the editor when the Yjs document binding changes, so the
      // Collaboration extension is attached at creation time. `yjsDoc` is
      // identity-stable (memoized in useYjsCollaboration), so a plain
      // non-collaborative editor never recreates.
    },
    [collaborationDoc]
  );

  useEffect(() => {
    if (!editor || !allowCollaboration || !yjsProvider || !collaborationUser) {
      return;
    }

    yjsProvider.awareness.setLocalStateField('user', collaborationUser);
    (
      editor.commands as {
        updateUser?: (attributes: typeof collaborationUser) => boolean;
      }
    ).updateUser?.(collaborationUser);
  }, [editor, allowCollaboration, yjsProvider, collaborationUser]);

  // Update editor's editable state when props change
  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Update editor content when the content prop changes externally
  useEffect(() => {
    if (!editor || allowCollaboration) return;

    // Skip sync if we're in a programmatic update (e.g., after converting text to task)
    // This prevents the effect from reverting editor content before state update propagates
    if (isProgrammaticUpdateRef.current) {
      isProgrammaticUpdateRef.current = false;
      hasDeferredExternalContentRef.current = false;
      deferredExternalContentRef.current = null;
      deferredEditorSnapshotRef.current = null;
      return;
    }

    if (editor.isFocused) {
      if (!hasDeferredExternalContentRef.current) {
        deferredEditorSnapshotRef.current = serializeEditorContent(
          editor.getJSON()
        );
      }
      hasDeferredExternalContentRef.current = true;
      deferredExternalContentRef.current = content;
      return;
    }

    hasDeferredExternalContentRef.current = false;
    deferredExternalContentRef.current = null;
    deferredEditorSnapshotRef.current = null;
    syncEditorContent(editor, content);
  }, [editor, content, allowCollaboration]);

  useEffect(() => {
    if (!editor || allowCollaboration) return;

    const syncDeferredContent = () => {
      if (!hasDeferredExternalContentRef.current) return;

      hasDeferredExternalContentRef.current = false;
      const deferredContent = deferredExternalContentRef.current;
      const deferredEditorSnapshot = deferredEditorSnapshotRef.current;
      deferredExternalContentRef.current = null;
      deferredEditorSnapshotRef.current = null;

      if (
        deferredEditorSnapshot !== null &&
        serializeEditorContent(editor.getJSON()) !== deferredEditorSnapshot
      ) {
        return;
      }

      syncEditorContent(editor, deferredContent);
    };

    editor.on('blur', syncDeferredContent);

    return () => {
      editor.off('blur', syncDeferredContent);
    };
  }, [editor, allowCollaboration]);

  // Handle initial cursor positioning when focusing from title
  useEffect(() => {
    if (
      editor &&
      initialCursorOffset !== null &&
      initialCursorOffset !== undefined
    ) {
      // Use requestAnimationFrame to ensure editor is fully ready
      requestAnimationFrame(() => {
        try {
          const doc = editor.state.doc;
          const firstNode = doc.firstChild;

          if (firstNode) {
            // Calculate position: 1 (start of doc) + offset within first line
            // Cap it at the length of the first text node
            const firstTextLength = firstNode.textContent.length;
            const actualOffset = Math.min(initialCursorOffset, firstTextLength);
            const newPos = Math.max(
              1,
              Math.min(1 + actualOffset, doc.content.size - 1)
            );

            // Create a text selection at the target position
            const tr = editor.state.tr.setSelection(
              TextSelection.near(doc.resolve(newPos))
            );
            editor.view.dispatch(tr);
          }
        } catch (error) {
          console.error('Error setting cursor position:', error);
        }
      });
    }
  }, [editor, initialCursorOffset]);

  // Expose flush method via ref - returns current content
  useEffect(() => {
    if (!flushPendingRef || !editor) return;

    flushPendingRef.current = () => {
      // When using collaboration, get content directly from editor (which reflects Yjs state)
      if (allowCollaboration) {
        const currentContent = editor.getJSON();
        return hasContent(currentContent) ? currentContent : null;
      }

      // Mark that we're doing a programmatic update to skip content sync
      isProgrammaticUpdateRef.current = true;

      // Get current editor content
      const currentContent = editor.getJSON();
      const finalContent = hasContent(currentContent) ? currentContent : null;

      // Use flushSync to ensure state update happens synchronously
      // This prevents React from batching and potentially re-rendering
      // with stale content prop before the update propagates
      flushSync(() => {
        onChangeRef.current?.(finalContent);
      });

      // Cancel any pending debounced changes since we've already synced
      if (debouncedOnChangeRef.current) {
        debouncedOnChangeRef.current.cancel();
      }

      // Return the content so caller can use it immediately
      return finalContent;
    };
  }, [editor, flushPendingRef, allowCollaboration]);

  // Track whether the fixed toolbar is visible in the viewport.
  // When it is, we suppress the floating BubbleMenu to avoid duplication.
  const fixedToolbarRef = useRef<HTMLDivElement>(null);
  // Mirrors focus-within for the toolbar handlers below. A ref (not state)
  // because the listeners are attached once and read it at event time.
  const hasFocusWithinRef = useRef(false);
  const [fixedToolbarVisible, setFixedToolbarVisible] = useState(true);

  useEffect(() => {
    const el = fixedToolbarRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setFixedToolbarVisible(entry.isIntersecting);
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="group relative h-full"
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          hasFocusWithinRef.current = false;
        }
      }}
      onFocusCapture={() => {
        hasFocusWithinRef.current = true;
      }}
      onMouseDown={(event) => {
        // While the toolbar is hidden it is `pointer-events-none`, so it never
        // shows a hover state or a tooltip — and a press in that strip lands
        // here instead. Put the caret in the text rather than swallowing it, so
        // reaching for a formatting control still gets you into the description.
        if (!revealToolbarOnFocus || hasFocusWithinRef.current || !editor) {
          return;
        }

        if (event.target !== event.currentTarget) return;

        event.preventDefault();
        editor.commands.focus();
      }}
    >
      {!readOnly && (
        <FixedToolbar
          ref={fixedToolbarRef}
          className={
            revealToolbarOnFocus
              ? REVEAL_TOOLBAR_ON_FOCUS_CLASS_NAME
              : undefined
          }
          editor={editor}
          workspaceId={workspaceId}
          onImageUpload={onImageUpload}
          onConvertToTask={onConvertToTask}
          leadingContent={toolbarLeadingContent}
          toggleBlockLabel={toggleBlockLabel}
          copyLabels={copyLabels}
        />
      )}
      {!readOnly && (
        <ToolBar
          editor={editor}
          fixedToolbarVisible={fixedToolbarVisible}
          saveButtonLabel={saveButtonLabel}
          savedButtonLabel={savedButtonLabel}
          workspaceId={workspaceId}
          onImageUpload={onImageUpload}
          onConvertToTask={onConvertToTask}
          toggleBlockLabel={toggleBlockLabel}
        />
      )}
      {/* Temporarily hide drag handle to resolve 'removeChild' error until finding a more robust solution
      !readOnly && <EditorDragHandle editor={editor} /> */}
      <EditorContent editor={editor} />
    </div>
  );
}
