'use client';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { LettinNode } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
export function RichEditor({
  value,
  onChange,
}: {
  value: LettinNode;
  onChange: (content: LettinNode) => void;
}) {
  const t = useTranslations('lettin');
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
        heading: { levels: [2, 3] },
      }),
    ],
    content: value,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as LettinNode),
    editorProps: {
      attributes: {
        'aria-label': t('content'),
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
  });
  return (
    <div className="lettin-editor overflow-hidden rounded-lg border border-input bg-card">
      <div
        className="flex flex-wrap gap-1 border-border border-b p-2"
        role="toolbar"
        aria-label={t('formatting')}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={editor?.isActive('bold') ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          {t('bold')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={editor?.isActive('italic') ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          {t('italic')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={editor?.isActive('heading', { level: 2 }) ?? false}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          {t('heading')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={editor?.isActive('bulletList') ?? false}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          {t('list')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={editor?.isActive('blockquote') ?? false}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          {t('quote')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor?.chain().focus().undo().run()}
        >
          {t('undo')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor?.chain().focus().redo().run()}
        >
          {t('redo')}
        </Button>
      </div>
      <EditorContent className="lettin-prose" editor={editor} />
    </div>
  );
}
