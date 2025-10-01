import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Button } from '@tuturuuu/ui/button';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImageIcon,
  Italic,
  Link,
  List,
  ListOrdered,
  Loader2,
  Strikethrough,
  Subscript,
  Superscript,
  Video,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { Toggle } from '@tuturuuu/ui/toggle';
import { useCallback, useEffect, useRef, useState } from 'react';

type LinkEditorContext = 'bubble' | 'popover' | null;

interface ToolBarProps {
  editor: Editor | null;
  hasChanges: boolean;
  onSave: () => void;
  saveButtonLabel?: string;
  savedButtonLabel?: string;
  workspaceId?: string;
  onImageUpload?: (file: File) => Promise<string>;
}

export function ToolBar({ editor, workspaceId, onImageUpload }: ToolBarProps) {
  const [linkEditorContext, setLinkEditorContext] =
    useState<LinkEditorContext>(null);
  const [linkHref, setLinkHref] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkRange, setLinkRange] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [, setEditorVersion] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      setEditorVersion((version) => version + 1);
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

  const formattingOptions = [
    {
      key: 'heading-1',
      icon: <Heading1 className="size-4" />,
      onClick: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
      pressed: editor?.isActive('heading', { level: 1 }),
    },
    {
      key: 'heading-2',
      icon: <Heading2 className="size-4" />,
      onClick: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      pressed: editor?.isActive('heading', { level: 2 }),
    },
    {
      key: 'heading-3',
      icon: <Heading3 className="size-4" />,
      onClick: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
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
      onClick: () => editor?.chain().focus().toggleBulletList().run(),
      pressed: editor?.isActive('bulletList'),
    },
    {
      key: 'ordered-list',
      icon: <ListOrdered className="size-4" />,
      onClick: () => editor?.chain().focus().toggleOrderedList().run(),
      pressed: editor?.isActive('orderedList'),
    },
    {
      key: 'highlight',
      icon: <Highlighter className="size-4" />,
      onClick: () => editor?.chain().focus().toggleHighlight().run(),
      pressed: editor?.isActive('highlight'),
    },
  ] as const;

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
      const maxSize = 5 * 1024 * 1024;
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
        const imageNode =
          state.schema.nodes.imageResize || state.schema.nodes.image;

        if (imageNode) {
          const transaction = state.tr.insert(
            from,
            imageNode.create({ src: url })
          );
          editor.view.dispatch(transaction);
          toast.success('Image uploaded successfully');
        } else {
          console.error('Available nodes:', Object.keys(state.schema.nodes));
          toast.error('Image node not found');
        }
      } catch (error) {
        console.error('Failed to upload image:', error);
        toast.error('Failed to upload image. Please try again.');
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

  const handleAddYoutube = useCallback(() => {
    if (!youtubeUrl || !editor) return;

    editor.chain().focus().setYoutubeVideo({ src: youtubeUrl }).run();
    setYoutubeUrl('');
    setShowYoutubeInput(false);
    toast.success('YouTube video added');
  }, [editor, youtubeUrl]);

  const renderFormattingOptions = useCallback(
    (source: 'bubble' | 'popover') => (
      <div className="flex flex-wrap gap-2">
        {formattingOptions.map((option) => (
          <Toggle
            key={`${option.key}-${source}`}
            pressed={option.pressed as boolean}
            onPressedChange={() => option.onClick()}
            className="h-8 w-8 rounded-md border border-transparent transition-colors data-[state=on]:border-foreground/10 data-[state=on]:bg-dynamic-surface/80 data-[state=on]:text-foreground"
          >
            {option.icon}
          </Toggle>
        ))}
        <Toggle
          key={`link-${source}`}
          pressed={editor?.isActive('link') || linkEditorContext === source}
          onPressedChange={() => openLinkEditor(source)}
          className="h-8 w-8 rounded-md border border-transparent transition-colors data-[state=on]:border-foreground/10 data-[state=on]:bg-dynamic-surface/80 data-[state=on]:text-foreground"
        >
          <Link className="size-4" />
        </Toggle>
        {workspaceId && onImageUpload && (
          <Toggle
            key={`image-${source}`}
            pressed={false}
            onPressedChange={triggerImageUpload}
            disabled={isUploadingImage}
            className="h-8 w-8 rounded-md border border-transparent transition-colors data-[state=on]:border-foreground/10 data-[state=on]:bg-dynamic-surface/80 data-[state=on]:text-foreground"
          >
            {isUploadingImage ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImageIcon className="size-4" />
            )}
          </Toggle>
        )}
        <Toggle
          key={`youtube-${source}`}
          pressed={showYoutubeInput}
          onPressedChange={() => setShowYoutubeInput(!showYoutubeInput)}
          className="h-8 w-8 rounded-md border border-transparent transition-colors data-[state=on]:border-foreground/10 data-[state=on]:bg-dynamic-surface/80 data-[state=on]:text-foreground"
        >
          <Video className="size-4" />
        </Toggle>
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
      showYoutubeInput,
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
      <BubbleMenu
        editor={editor}
        className="z-50"
        shouldShow={({ editor: bubbleEditor, from, to }) => {
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
        <div className="pointer-events-auto flex flex-col gap-2 rounded-lg border border-dynamic-border bg-background p-2">
          {renderFormattingOptions('bubble')}
          {linkEditorContext === 'bubble' ? renderLinkEditor('bubble') : null}
          {showYoutubeInput ? renderYoutubeInput() : null}
        </div>
      </BubbleMenu>
    </>
  );
}
