import type { QueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import type { CitationEditorConfig } from './citation/citation-layer';
import type { EditorCopyLabels } from './copy-menu';
import type { TaskMentionNodeViewRenderer } from './mention-extension';

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
  allowEmbeds?: boolean;
  onImageUpload?: (file: File) => Promise<string>;
  flushPendingRef?: { current: (() => JSONContent | null) | undefined };
  onArrowUp?: (cursorOffset?: number) => void;
  onArrowLeft?: () => void;
  editorRef?: { current: Editor | null };
  initialCursorOffset?: number | null;
  onEditorReady?: (editor: Editor) => void;
  yjsDoc?: Y.Doc;
  yjsProvider?: { awareness: Awareness };
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
  /**
   * Stretch the editable surface to the host's full height so a click anywhere
   * below the last line still places the caret. The host must give the editor a
   * bounded, scrollable box; the toolbar keeps its natural height.
   */
  fillHeight?: boolean;
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
  toolbarToolsLabel?: string;
  toggleBlockLabel?: string;
  copyLabels?: EditorCopyLabels;
  /**
   * Opt-in citation insertion, references and drawer. Formatting, validation,
   * library and capture are injected by the host so the shared editor never
   * loads the citation engine.
   */
  citations?: CitationEditorConfig;
}
