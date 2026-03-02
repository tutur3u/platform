import { formatForDisplay } from '@tanstack/react-hotkeys';
import type { QueryClient } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CirclePlus,
  Columns2,
  Combine,
  FileVideo,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImageIcon,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Loader2,
  Rows2,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Trash2,
  Workflow,
  YoutubeIcon,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { Toggle } from '@tuturuuu/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { convertListItemToTask } from '@tuturuuu/utils/editor';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  StorageQuotaError,
} from './media-utils';

type LinkEditorContext = 'bubble' | 'popover' | null;

// ---------------------------------------------------------------------------
// Hotkey definitions – use 'Mod' for cross-platform (⌘ on Mac, Ctrl on Win)
// These match Tiptap's built-in shortcuts where applicable.
// ---------------------------------------------------------------------------
const HOTKEYS = {
  'heading-1': 'Mod+Alt+1',
  'heading-2': 'Mod+Alt+2',
  'heading-3': 'Mod+Alt+3',
  bold: 'Mod+B',
  italic: 'Mod+I',
  strike: 'Mod+Shift+S',
  subscript: 'Mod+,',
  superscript: 'Mod+.',
  'align-left': 'Mod+Shift+L',
  'align-center': 'Mod+Shift+E',
  'align-right': 'Mod+Shift+R',
  'bullet-list': 'Mod+Shift+8',
  'ordered-list': 'Mod+Shift+7',
  'task-list': 'Mod+Shift+9',
  table: '',
  highlight: 'Mod+Shift+H',
  link: 'Mod+K',
  image: '',
  video: '',
  youtube: '',
  'convert-to-task': '',
} as const;

// Labels for each formatting option
const LABELS: Record<string, string> = {
  'heading-1': 'Heading 1',
  'heading-2': 'Heading 2',
  'heading-3': 'Heading 3',
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  subscript: 'Subscript',
  superscript: 'Superscript',
  'align-left': 'Align Left',
  'align-center': 'Align Center',
  'align-right': 'Align Right',
  'bullet-list': 'Bullet List',
  'ordered-list': 'Ordered List',
  'task-list': 'Task List',
  table: 'Insert Table',
  highlight: 'Highlight',
  link: 'Link',
  image: 'Upload Image',
  video: 'Upload Video',
  youtube: 'YouTube Video',
  'convert-to-task': 'Convert to Task',
};

// Semantic groups for the fixed toolbar
const TOOLBAR_GROUPS = [
  ['heading-1', 'heading-2', 'heading-3'],
  ['bold', 'italic', 'strike', 'subscript', 'superscript'],
  ['align-left', 'align-center', 'align-right'],
  ['bullet-list', 'ordered-list', 'task-list'],
  ['table', 'highlight', 'link'],
] as const;

/** Format a hotkey combo string for display (platform-aware). */
function hotkeyLabel(key: string): string {
  const combo = HOTKEYS[key as keyof typeof HOTKEYS];
  if (!combo) return '';
  try {
    return formatForDisplay(combo);
  } catch {
    return combo;
  }
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

interface ToolbarButtonProps {
  id: string;
  icon: React.ReactNode;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/** A single toolbar toggle button wrapped with a tooltip showing name + hotkey. */
function ToolbarButton({
  id,
  icon,
  pressed,
  onClick,
  disabled,
}: ToolbarButtonProps) {
  const label = LABELS[id] ?? id;
  const shortcut = hotkeyLabel(id);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          pressed={pressed}
          onPressedChange={() => onClick()}
          onMouseDown={(e) => e.preventDefault()}
          disabled={disabled}
          className="h-8 w-8 rounded-md border border-transparent transition-colors data-[state=on]:border-foreground/10 data-[state=on]:bg-dynamic-surface/80 data-[state=on]:text-foreground"
          aria-label={label}
        >
          {icon}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-1.5">
        <span>{label}</span>
        {shortcut && (
          <kbd className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Vertical divider between toolbar groups */
function ToolbarSeparator() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-dynamic-border/60" />;
}

// ---------------------------------------------------------------------------
// Main ToolBar (BubbleMenu)
// ---------------------------------------------------------------------------

interface ToolBarProps {
  editor: Editor | null;
  saveButtonLabel?: string;
  savedButtonLabel?: string;
  workspaceId?: string;
  onImageUpload?: (file: File) => Promise<string>;
  boardId?: string;
  availableLists?: TaskList[];
  queryClient?: QueryClient;
  onFlushChanges?: () => void;
  /** When true, the BubbleMenu is hidden because the fixed toolbar is visible */
  fixedToolbarVisible?: boolean;
}

export function ToolBar({
  editor,
  fixedToolbarVisible,
  workspaceId,
  onImageUpload,
  boardId,
  availableLists,
  queryClient,
  onFlushChanges,
}: ToolBarProps) {
  const [linkEditorContext, setLinkEditorContext] =
    useState<LinkEditorContext>(null);
  const [linkHref, setLinkHref] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkRange, setLinkRange] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [showYoutubeInput, setShowYoutubeInput] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');

  const closeLinkEditor = useCallback((context?: 'bubble' | 'popover') => {
    setLinkEditorContext((current) => {
      if (context && current !== context) {
        return current;
      }
      return null;
    });
  }, []);

  useEffect(() => {
    const rerender = () => {
      if (editor?.state.selection.empty) {
        closeLinkEditor('bubble');
      }
    };

    editor?.on('selectionUpdate', rerender);
    editor?.on('transaction', rerender);

    return () => {
      editor?.off('selectionUpdate', rerender);
      editor?.off('transaction', rerender);
    };
  }, [closeLinkEditor, editor]);

  useEffect(() => {
    if (linkEditorContext === null) {
      setLinkHref('');
      setLinkText('');
      setLinkRange(null);
      setIsEditingLink(false);
    }
  }, [linkEditorContext]);

  const openLinkEditor = useCallback(
    (source: 'bubble' | 'popover') => {
      if (!editor) return;

      const { from, to } = editor.state.selection;
      setLinkRange({ from, to });

      const selectedText = editor.state.doc.textBetween(from, to).trim();

      if (editor.isActive('link')) {
        setIsEditingLink(true);
        const currentUrl = editor.getAttributes('link').href ?? '';
        setLinkHref(currentUrl);
        setLinkText(selectedText);
      } else {
        setIsEditingLink(false);
        setLinkHref('');
        setLinkText(selectedText);
      }

      setLinkEditorContext(source);
    },
    [editor]
  );

  // Build the formatting option map used by both fixed and bubble toolbars
  const formattingOptions = useMemo(
    () =>
      [
        {
          key: 'heading-1',
          icon: <Heading1 className="size-4" />,
          onClick: () =>
            editor?.chain().focus().toggleHeading({ level: 1 }).run(),
          pressed: editor?.isActive('heading', { level: 1 }),
        },
        {
          key: 'heading-2',
          icon: <Heading2 className="size-4" />,
          onClick: () =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run(),
          pressed: editor?.isActive('heading', { level: 2 }),
        },
        {
          key: 'heading-3',
          icon: <Heading3 className="size-4" />,
          onClick: () =>
            editor?.chain().focus().toggleHeading({ level: 3 }).run(),
          pressed: editor?.isActive('heading', { level: 3 }),
        },
        {
          key: 'bold',
          icon: <Bold className="size-4" />,
          onClick: () => editor?.chain().focus().toggleBold().run(),
          pressed: editor?.isActive('bold'),
        },
        {
          key: 'italic',
          icon: <Italic className="size-4" />,
          onClick: () => editor?.chain().focus().toggleItalic().run(),
          pressed: editor?.isActive('italic'),
        },
        {
          key: 'strike',
          icon: <Strikethrough className="size-4" />,
          onClick: () => editor?.chain().focus().toggleStrike().run(),
          pressed: editor?.isActive('strike'),
        },
        {
          key: 'subscript',
          icon: <Subscript className="size-4" />,
          onClick: () => editor?.chain().focus().toggleSubscript().run(),
          pressed: editor?.isActive('subscript'),
        },
        {
          key: 'superscript',
          icon: <Superscript className="size-4" />,
          onClick: () => editor?.chain().focus().toggleSuperscript().run(),
          pressed: editor?.isActive('superscript'),
        },
        {
          key: 'align-left',
          icon: <AlignLeft className="size-4" />,
          onClick: () => editor?.chain().focus().setTextAlign('left').run(),
          pressed: editor?.isActive({ textAlign: 'left' }),
        },
        {
          key: 'align-center',
          icon: <AlignCenter className="size-4" />,
          onClick: () => editor?.chain().focus().setTextAlign('center').run(),
          pressed: editor?.isActive({ textAlign: 'center' }),
        },
        {
          key: 'align-right',
          icon: <AlignRight className="size-4" />,
          onClick: () => editor?.chain().focus().setTextAlign('right').run(),
          pressed: editor?.isActive({ textAlign: 'right' }),
        },
        {
          key: 'bullet-list',
          icon: <List className="size-4" />,
          onClick: () => editor?.chain().focus().toggleBulletListSmart().run(),
          pressed: editor?.isActive('bulletList'),
        },
        {
          key: 'ordered-list',
          icon: <ListOrdered className="size-4" />,
          onClick: () => editor?.chain().focus().toggleOrderedListSmart().run(),
          pressed: editor?.isActive('orderedList'),
        },
        {
          key: 'task-list',
          icon: <ListTodo className="size-4" />,
          onClick: () => editor?.chain().focus().toggleTaskListSmart().run(),
          pressed: editor?.isActive('taskList'),
        },
        {
          key: 'table',
          icon: <Table className="size-4" />,
          onClick: () =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run(),
          pressed: editor?.isActive('table'),
        },
        {
          key: 'highlight',
          icon: <Highlighter className="size-4" />,
          onClick: () => editor?.chain().focus().toggleHighlight().run(),
          pressed: editor?.isActive('highlight'),
        },
      ] as const,
    [editor]
  );

  const normalizeUrl = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
      return trimmed;
    }

    return `https://${trimmed}`;
  }, []);

  const handleApplyLink = useCallback(() => {
    const formattedUrl = normalizeUrl(linkHref);

    if (!formattedUrl) {
      return;
    }

    const displayText = linkText.trim();

    editor?.chain().focus();

    if (linkRange && linkRange.from !== linkRange.to) {
      editor
        ?.chain()
        .setTextSelection(linkRange)
        .setLink({ href: formattedUrl })
        .run();
    } else if (displayText) {
      editor
        ?.chain()
        .insertContent(`<a href="${formattedUrl}">${displayText}</a> `)
        .run();
    } else {
      editor
        ?.chain()
        .insertContent(`<a href="${formattedUrl}">${formattedUrl}</a> `)
        .run();
    }

    closeLinkEditor();
  }, [closeLinkEditor, editor, linkHref, linkRange, linkText, normalizeUrl]);

  const handleRemoveLink = useCallback(
    (context?: 'bubble' | 'popover') => {
      if (isEditingLink) {
        editor?.chain().focus().unsetLink().run();
      }
      closeLinkEditor(context);
    },
    [closeLinkEditor, editor, isEditingLink]
  );

  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !editor || !onImageUpload) return;

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }

      // Validate file size (max 5MB)
      const maxSize = MAX_IMAGE_SIZE;
      if (file.size > maxSize) {
        toast.error('Image size must be less than 5MB');
        return;
      }

      try {
        setIsUploadingImage(true);
        const url = await onImageUpload(file);

        // Insert image at current cursor position
        // Use direct node insertion for ImageResize extension
        const { state } = editor.view;
        const { from } = state.selection;
        const imageNode = state.schema.nodes.imageResize;

        if (imageNode) {
          // Get container width for default size (60%)
          const editorElement = editor.view.dom as HTMLElement;
          const containerWidth =
            editorElement.querySelector('.ProseMirror')?.clientWidth ||
            editorElement.clientWidth ||
            800;
          const defaultWidth = (60 / 100) * containerWidth; // md = 60%

          const transaction = state.tr.insert(
            from,
            imageNode.create({ src: url, width: defaultWidth })
          );
          editor.view.dispatch(transaction);
          toast.success('Image uploaded successfully');
        } else {
          console.error('Available nodes:', Object.keys(state.schema.nodes));
          toast.error('Image node not found');
        }
      } catch (error) {
        console.error('Failed to upload image:', error);
        if (error instanceof StorageQuotaError) {
          toast.error(error.message);
        } else if (error instanceof Error) {
          toast.error(
            error.message || 'Failed to upload image. Please try again.'
          );
        } else {
          toast.error('Failed to upload image. Please try again.');
        }
      } finally {
        setIsUploadingImage(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [editor, onImageUpload]
  );

  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleVideoUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !editor || !onImageUpload) return;

      // Validate file type
      if (!file.type.startsWith('video/')) {
        toast.error('Please select a video file');
        return;
      }

      // Validate file size (max 50MB)
      const maxSize = MAX_VIDEO_SIZE;
      if (file.size > maxSize) {
        toast.error('Video size must be less than 50MB');
        return;
      }

      try {
        setIsUploadingVideo(true);
        // Reuse the same upload handler for videos
        const url = await onImageUpload(file);

        // Insert video at current cursor position
        const { state } = editor.view;
        const { from } = state.selection;
        const videoNode = state.schema.nodes.video;

        if (videoNode) {
          const transaction = state.tr.insert(
            from,
            videoNode.create({ src: url })
          );
          editor.view.dispatch(transaction);
          toast.success('Video uploaded successfully');
        } else {
          console.error('Available nodes:', Object.keys(state.schema.nodes));
          toast.error('Video node not found');
        }
      } catch (error) {
        console.error('Failed to upload video:', error);
        if (error instanceof StorageQuotaError) {
          toast.error(error.message);
        } else if (error instanceof Error) {
          toast.error(
            error.message || 'Failed to upload video. Please try again.'
          );
        } else {
          toast.error('Failed to upload video. Please try again.');
        }
      } finally {
        setIsUploadingVideo(false);
        // Reset file input
        if (videoInputRef.current) {
          videoInputRef.current.value = '';
        }
      }
    },
    [editor, onImageUpload]
  );

  const triggerVideoUpload = useCallback(() => {
    videoInputRef.current?.click();
  }, []);

  const handleAddYoutube = useCallback(() => {
    if (!youtubeUrl || !editor) return;

    editor.chain().focus().setYoutubeVideo({ src: youtubeUrl }).run();
    setYoutubeUrl('');
    setShowYoutubeInput(false);
    toast.success('YouTube video added');
  }, [editor, youtubeUrl]);

  const handleConvertToTask = useCallback(async () => {
    if (!editor || !boardId || !availableLists || !queryClient) return;

    // Get the first available list
    const firstList = availableLists[0];
    if (!firstList) {
      toast.error('No lists available', {
        description: 'Create a list first before converting items to tasks',
      });
      return;
    }

    // Store the created task to add to cache later
    let createdTask: Task | null = null;

    // Use shared conversion helper
    const result = await convertListItemToTask({
      editor,
      listId: firstList.id,
      listName: firstList.name,
      wrapInParagraph: true,
      createTask: async ({
        name,
        listId,
      }: {
        name: string;
        listId: string;
      }) => {
        const supabase = createClient();
        // Select all fields needed for the Task type to add to cache
        const { data: newTask, error } = await supabase
          .from('tasks')
          .insert({
            name,
            list_id: listId,
          })
          .select('*')
          .single();

        if (error || !newTask) throw error;

        // Store full task for cache update
        createdTask = {
          ...newTask,
          assignees: [],
          labels: [],
          projects: [],
        } as Task;

        return {
          id: newTask.id,
          name: newTask.name,
          display_number: newTask.display_number ?? undefined,
          // Pass task list color and priority for mention node
          priority: newTask.priority || undefined,
          listColor: firstList.color || undefined,
          entityType: 'task',
        };
      },
    });

    if (!result.success) {
      toast.error(result.error!.message, {
        description: result.error!.description,
      });
      return;
    }

    // CRITICAL: Flush the debounced editor change immediately after inserting the mention.
    onFlushChanges?.();

    // Add the new task to the cache directly instead of invalidating
    if (createdTask) {
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return [createdTask];
          if (old.some((t) => t.id === createdTask!.id)) return old;
          return [...old, createdTask];
        }
      );
    }

    // Only invalidate time tracking data since task availability affects it
    await queryClient.invalidateQueries({
      queryKey: ['time-tracking-data'],
    });

    toast.success('Task created', {
      description: `Created task "${result.taskName}" and added mention`,
    });
  }, [editor, boardId, availableLists, queryClient, onFlushChanges]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  /** Renders the core formatting buttons (used by both fixed and bubble toolbar) */
  const renderFormattingOptions = useCallback(
    (source: 'bubble' | 'popover') => (
      <div className="flex flex-wrap items-center gap-1">
        {formattingOptions.map((option) => (
          <ToolbarButton
            key={`${option.key}-${source}`}
            id={option.key}
            icon={option.icon}
            pressed={option.pressed as boolean}
            onClick={option.onClick}
          />
        ))}

        {/* Link */}
        <ToolbarSeparator />
        <ToolbarButton
          id="link"
          icon={<Link className="size-4" />}
          pressed={editor?.isActive('link') || linkEditorContext === source}
          onClick={() => openLinkEditor(source)}
        />

        {/* Media uploads */}
        {workspaceId && onImageUpload && (
          <>
            <ToolbarSeparator />
            <ToolbarButton
              id="image"
              icon={
                isUploadingImage ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImageIcon className="size-4" />
                )
              }
              pressed={false}
              onClick={triggerImageUpload}
              disabled={isUploadingImage}
            />
            <ToolbarButton
              id="video"
              icon={
                isUploadingVideo ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileVideo className="size-4" />
                )
              }
              pressed={false}
              onClick={triggerVideoUpload}
              disabled={isUploadingVideo}
            />
          </>
        )}

        <ToolbarButton
          id="youtube"
          icon={<YoutubeIcon className="size-4" />}
          pressed={showYoutubeInput}
          onClick={() => setShowYoutubeInput(!showYoutubeInput)}
        />

        {/* Convert to task */}
        {boardId && availableLists && queryClient && (
          <>
            <ToolbarSeparator />
            <ToolbarButton
              id="convert-to-task"
              icon={<CirclePlus className="size-4" />}
              pressed={false}
              onClick={handleConvertToTask}
            />
          </>
        )}
      </div>
    ),
    [
      editor,
      formattingOptions,
      linkEditorContext,
      openLinkEditor,
      workspaceId,
      onImageUpload,
      triggerImageUpload,
      isUploadingImage,
      triggerVideoUpload,
      isUploadingVideo,
      showYoutubeInput,
      boardId,
      availableLists,
      queryClient,
      handleConvertToTask,
    ]
  );

  const renderYoutubeInput = useCallback(
    () => (
      <div className="space-y-2 rounded-md border border-dynamic-border bg-dynamic-surface/80 p-3">
        <div className="space-y-1">
          <label className="font-medium text-muted-foreground text-xs">
            YouTube URL
          </label>
          <Input
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            type="url"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddYoutube();
              }
            }}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowYoutubeInput(false);
              setYoutubeUrl('');
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleAddYoutube}
            disabled={!youtubeUrl.trim()}
          >
            Add Video
          </Button>
        </div>
      </div>
    ),
    [youtubeUrl, handleAddYoutube]
  );

  const renderTableControls = useCallback(
    () => (
      <div className="min-w-[320px] space-y-3 rounded-md border border-dynamic-border bg-dynamic-surface/80 p-3">
        <div className="flex items-center justify-between border-dynamic-border/50 border-b pb-2">
          <div className="flex items-center gap-2">
            <Table className="size-4 text-dynamic-blue" />
            <span className="font-semibold text-foreground text-sm">
              Table Options
            </span>
          </div>
        </div>

        {/* Column Controls */}
        <div className="space-y-1.5">
          <label className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Columns
          </label>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => editor?.chain().focus().addColumnBefore().run()}
              onMouseDown={(e) => e.preventDefault()}
              className="h-8 flex-1 text-xs"
            >
              <Columns2 className="mr-1.5 size-3.5" />
              Insert Left
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => editor?.chain().focus().addColumnAfter().run()}
              onMouseDown={(e) => e.preventDefault()}
              className="h-8 flex-1 text-xs"
            >
              <Columns2 className="mr-1.5 size-3.5" />
              Insert Right
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => editor?.chain().focus().deleteColumn().run()}
              onMouseDown={(e) => e.preventDefault()}
              className="h-8 px-2 text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Row Controls */}
        <div className="space-y-1.5">
          <label className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Rows
          </label>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => editor?.chain().focus().addRowBefore().run()}
              onMouseDown={(e) => e.preventDefault()}
              className="h-8 flex-1 text-xs"
            >
              <Rows2 className="mr-1.5 size-3.5" />
              Insert Above
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => editor?.chain().focus().addRowAfter().run()}
              onMouseDown={(e) => e.preventDefault()}
              className="h-8 flex-1 text-xs"
            >
              <Rows2 className="mr-1.5 size-3.5" />
              Insert Below
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => editor?.chain().focus().deleteRow().run()}
              onMouseDown={(e) => e.preventDefault()}
              className="h-8 px-2 text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Cell Controls */}
        <div className="space-y-1.5">
          <label className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Cells
          </label>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => editor?.chain().focus().mergeCells().run()}
              onMouseDown={(e) => e.preventDefault()}
              className="h-8 flex-1 text-xs"
            >
              <Combine className="mr-1.5 size-3.5" />
              Merge
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => editor?.chain().focus().splitCell().run()}
              onMouseDown={(e) => e.preventDefault()}
              className="h-8 flex-1 text-xs"
            >
              <Workflow className="mr-1.5 size-3.5" />
              Split
            </Button>
          </div>
        </div>

        {/* Delete Table */}
        <div className="border-dynamic-border/50 border-t pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              editor?.chain().focus().deleteTable().run();
            }}
            onMouseDown={(e) => e.preventDefault()}
            className="h-8 w-full text-dynamic-red text-xs hover:bg-dynamic-red/10 hover:text-dynamic-red"
          >
            <Trash2 className="mr-1.5 size-3.5" />
            Delete Table
          </Button>
        </div>
      </div>
    ),
    [editor]
  );

  const renderLinkEditor = useCallback(
    (source: 'bubble' | 'popover') => (
      <div className="space-y-2 rounded-md border border-dynamic-border bg-dynamic-surface/80 p-3">
        <div className="space-y-1">
          <label className="font-medium text-muted-foreground text-xs">
            Link URL
          </label>
          <Input
            value={linkHref}
            onChange={(event) => setLinkHref(event.target.value)}
            placeholder="https://example.com"
            type="url"
          />
        </div>
        <div className="space-y-1">
          <label className="font-medium text-muted-foreground text-xs">
            Display text (optional)
          </label>
          <Input
            value={linkText}
            onChange={(event) => setLinkText(event.target.value)}
            placeholder="My helpful resource"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleRemoveLink(source)}
          >
            {isEditingLink ? 'Remove' : 'Cancel'}
          </Button>
          <Button type="button" size="sm" onClick={handleApplyLink}>
            Apply
          </Button>
        </div>
      </div>
    ),
    [handleApplyLink, handleRemoveLink, isEditingLink, linkHref, linkText]
  );

  if (!editor) return null;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoUpload}
        className="hidden"
      />
      <BubbleMenu
        editor={editor}
        className="z-50"
        shouldShow={({ editor: bubbleEditor, from, to }) => {
          if (fixedToolbarVisible) return false;
          if (!bubbleEditor.isEditable) return false;
          if (!bubbleEditor.isFocused) return false;
          if (from === to) return false;
          if (
            bubbleEditor.isActive('codeBlock') ||
            bubbleEditor.isActive('image')
          ) {
            return false;
          }
          return true;
        }}
      >
        <div className="flex flex-col gap-2 rounded-lg border border-dynamic-border bg-background p-2 shadow-lg">
          {renderFormattingOptions('bubble')}
          {linkEditorContext === 'bubble' ? renderLinkEditor('bubble') : null}
          {showYoutubeInput ? renderYoutubeInput() : null}
          {editor?.isActive('table') ? renderTableControls() : null}
        </div>
      </BubbleMenu>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fixed Toolbar (always-visible, rendered above the editor)
// ---------------------------------------------------------------------------

interface FixedToolbarProps {
  editor: Editor | null;
  workspaceId?: string;
  onImageUpload?: (file: File) => Promise<string>;
  boardId?: string;
  availableLists?: TaskList[];
  queryClient?: QueryClient;
  onFlushChanges?: () => void;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
}

export function FixedToolbar({
  editor,
  workspaceId,
  onImageUpload,
  boardId,
  availableLists,
  queryClient,
  onFlushChanges,
  className,
  ref,
}: FixedToolbarProps) {
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Build the formatting option map
  const formattingOptions = useMemo(() => {
    if (!editor)
      return new Map<
        string,
        { onClick: () => void; pressed: boolean; icon: React.ReactNode }
      >();
    const map = new Map<
      string,
      { onClick: () => void; pressed: boolean; icon: React.ReactNode }
    >();
    const items: Array<{
      key: string;
      icon: React.ReactNode;
      onClick: () => void;
      pressed: boolean;
    }> = [
      {
        key: 'heading-1',
        icon: <Heading1 className="size-4" />,
        onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        pressed: editor.isActive('heading', { level: 1 }),
      },
      {
        key: 'heading-2',
        icon: <Heading2 className="size-4" />,
        onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        pressed: editor.isActive('heading', { level: 2 }),
      },
      {
        key: 'heading-3',
        icon: <Heading3 className="size-4" />,
        onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        pressed: editor.isActive('heading', { level: 3 }),
      },
      {
        key: 'bold',
        icon: <Bold className="size-4" />,
        onClick: () => editor.chain().focus().toggleBold().run(),
        pressed: editor.isActive('bold'),
      },
      {
        key: 'italic',
        icon: <Italic className="size-4" />,
        onClick: () => editor.chain().focus().toggleItalic().run(),
        pressed: editor.isActive('italic'),
      },
      {
        key: 'strike',
        icon: <Strikethrough className="size-4" />,
        onClick: () => editor.chain().focus().toggleStrike().run(),
        pressed: editor.isActive('strike'),
      },
      {
        key: 'subscript',
        icon: <Subscript className="size-4" />,
        onClick: () => editor.chain().focus().toggleSubscript().run(),
        pressed: editor.isActive('subscript'),
      },
      {
        key: 'superscript',
        icon: <Superscript className="size-4" />,
        onClick: () => editor.chain().focus().toggleSuperscript().run(),
        pressed: editor.isActive('superscript'),
      },
      {
        key: 'align-left',
        icon: <AlignLeft className="size-4" />,
        onClick: () => editor.chain().focus().setTextAlign('left').run(),
        pressed: editor.isActive({ textAlign: 'left' }),
      },
      {
        key: 'align-center',
        icon: <AlignCenter className="size-4" />,
        onClick: () => editor.chain().focus().setTextAlign('center').run(),
        pressed: editor.isActive({ textAlign: 'center' }),
      },
      {
        key: 'align-right',
        icon: <AlignRight className="size-4" />,
        onClick: () => editor.chain().focus().setTextAlign('right').run(),
        pressed: editor.isActive({ textAlign: 'right' }),
      },
      {
        key: 'bullet-list',
        icon: <List className="size-4" />,
        onClick: () => editor.chain().focus().toggleBulletListSmart().run(),
        pressed: editor.isActive('bulletList'),
      },
      {
        key: 'ordered-list',
        icon: <ListOrdered className="size-4" />,
        onClick: () => editor.chain().focus().toggleOrderedListSmart().run(),
        pressed: editor.isActive('orderedList'),
      },
      {
        key: 'task-list',
        icon: <ListTodo className="size-4" />,
        onClick: () => editor.chain().focus().toggleTaskListSmart().run(),
        pressed: editor.isActive('taskList'),
      },
      {
        key: 'table',
        icon: <Table className="size-4" />,
        onClick: () =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run(),
        pressed: editor.isActive('table'),
      },
      {
        key: 'highlight',
        icon: <Highlighter className="size-4" />,
        onClick: () => editor.chain().focus().toggleHighlight().run(),
        pressed: editor.isActive('highlight'),
      },
      {
        key: 'link',
        icon: <Link className="size-4" />,
        onClick: () => editor.chain().focus().toggleLink({ href: '' }).run(),
        pressed: editor.isActive('link'),
      },
    ];
    for (const item of items) {
      map.set(item.key, item);
    }
    return map;
  }, [editor]);

  // Image upload handler
  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !editor || !onImageUpload) return;
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        toast.error('Image size must be less than 5MB');
        return;
      }
      try {
        setIsUploadingImage(true);
        const url = await onImageUpload(file);
        const { state } = editor.view;
        const { from } = state.selection;
        const imageNode = state.schema.nodes.imageResize;
        if (imageNode) {
          const editorElement = editor.view.dom as HTMLElement;
          const containerWidth =
            editorElement.querySelector('.ProseMirror')?.clientWidth ||
            editorElement.clientWidth ||
            800;
          const defaultWidth = (60 / 100) * containerWidth;
          const transaction = state.tr.insert(
            from,
            imageNode.create({ src: url, width: defaultWidth })
          );
          editor.view.dispatch(transaction);
          toast.success('Image uploaded successfully');
        }
      } catch (error) {
        if (error instanceof StorageQuotaError) toast.error(error.message);
        else toast.error('Failed to upload image. Please try again.');
      } finally {
        setIsUploadingImage(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [editor, onImageUpload]
  );

  // Video upload handler
  const handleVideoUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !editor || !onImageUpload) return;
      if (!file.type.startsWith('video/')) {
        toast.error('Please select a video file');
        return;
      }
      if (file.size > MAX_VIDEO_SIZE) {
        toast.error('Video size must be less than 50MB');
        return;
      }
      try {
        setIsUploadingVideo(true);
        const url = await onImageUpload(file);
        const { state } = editor.view;
        const { from } = state.selection;
        const videoNode = state.schema.nodes.video;
        if (videoNode) {
          const transaction = state.tr.insert(
            from,
            videoNode.create({ src: url })
          );
          editor.view.dispatch(transaction);
          toast.success('Video uploaded successfully');
        }
      } catch (error) {
        if (error instanceof StorageQuotaError) toast.error(error.message);
        else toast.error('Failed to upload video. Please try again.');
      } finally {
        setIsUploadingVideo(false);
        if (videoInputRef.current) videoInputRef.current.value = '';
      }
    },
    [editor, onImageUpload]
  );

  // Convert to task handler
  const handleConvertToTask = useCallback(async () => {
    if (!editor || !boardId || !availableLists || !queryClient) return;
    const firstList = availableLists[0];
    if (!firstList) {
      toast.error('No lists available');
      return;
    }
    let createdTask: Task | null = null;
    const result = await convertListItemToTask({
      editor,
      listId: firstList.id,
      listName: firstList.name,
      wrapInParagraph: true,
      createTask: async ({
        name,
        listId,
      }: {
        name: string;
        listId: string;
      }) => {
        const supabase = createClient();
        const { data: newTask, error } = await supabase
          .from('tasks')
          .insert({ name, list_id: listId })
          .select('*')
          .single();
        if (error || !newTask) throw error;
        createdTask = {
          ...newTask,
          assignees: [],
          labels: [],
          projects: [],
        } as Task;
        return {
          id: newTask.id,
          name: newTask.name,
          display_number: newTask.display_number ?? undefined,
          priority: newTask.priority || undefined,
          listColor: firstList.color || undefined,
          entityType: 'task',
        };
      },
    });
    if (!result.success) {
      toast.error(result.error!.message);
      return;
    }
    onFlushChanges?.();
    if (createdTask) {
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return [createdTask];
          if (old.some((t) => t.id === createdTask!.id)) return old;
          return [...old, createdTask];
        }
      );
    }
    await queryClient.invalidateQueries({ queryKey: ['time-tracking-data'] });
    toast.success('Task created', {
      description: `Created "${result.taskName}"`,
    });
  }, [editor, boardId, availableLists, queryClient, onFlushChanges]);

  if (!editor) return null;

  return (
    <div
      ref={ref}
      className={cn(
        'sticky top-0 z-40 flex flex-wrap items-center gap-1 rounded-t-md border-dynamic-border border-b bg-background/95 px-2 py-1.5 backdrop-blur-sm',
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoUpload}
        className="hidden"
      />

      {/* Grouped formatting options with separators */}
      {TOOLBAR_GROUPS.map((group, gi) => (
        <div key={gi} className="contents">
          {gi > 0 && <ToolbarSeparator />}
          {group.map((key) => {
            const opt = formattingOptions.get(key);
            if (!opt) return null;
            return (
              <ToolbarButton
                key={key}
                id={key}
                icon={opt.icon}
                pressed={opt.pressed}
                onClick={opt.onClick}
              />
            );
          })}
        </div>
      ))}

      {/* Media group */}
      {workspaceId && onImageUpload && (
        <>
          <ToolbarSeparator />
          <ToolbarButton
            id="image"
            icon={
              isUploadingImage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImageIcon className="size-4" />
              )
            }
            pressed={false}
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingImage}
          />
          <ToolbarButton
            id="video"
            icon={
              isUploadingVideo ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileVideo className="size-4" />
              )
            }
            pressed={false}
            onClick={() => videoInputRef.current?.click()}
            disabled={isUploadingVideo}
          />
        </>
      )}

      {/* Convert to task */}
      {boardId && availableLists && queryClient && (
        <>
          <ToolbarSeparator />
          <ToolbarButton
            id="convert-to-task"
            icon={<CirclePlus className="size-4" />}
            pressed={false}
            onClick={handleConvertToTask}
          />
        </>
      )}
    </div>
  );
}
