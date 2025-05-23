import { Editor } from '@tiptap/react';
import { Button } from '@tuturuuu/ui/button';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Save,
  Strikethrough,
} from '@tuturuuu/ui/icons';
import { Toggle } from '@tuturuuu/ui/toggle';

interface ToolBarProps {
  editor: Editor | null;
  hasChanges: boolean;
  onSave: () => void;
}

export default function ToolBar({ editor, hasChanges, onSave }: ToolBarProps) {
  if (!editor) {
    return null;
  }

  const Options = [
    {
      icon: <Heading1 className="size-4" />,
      onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      preesed: editor.isActive('heading', { level: 1 }),
    },
    {
      icon: <Heading2 className="size-4" />,
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      preesed: editor.isActive('heading', { level: 2 }),
    },
    {
      icon: <Heading3 className="size-4" />,
      onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      preesed: editor.isActive('heading', { level: 3 }),
    },
    {
      icon: <Bold className="size-4" />,
      onClick: () => editor.chain().focus().toggleBold().run(),
      preesed: editor.isActive('bold'),
    },
    {
      icon: <Italic className="size-4" />,
      onClick: () => editor.chain().focus().toggleItalic().run(),
      preesed: editor.isActive('italic'),
    },
    {
      icon: <Strikethrough className="size-4" />,
      onClick: () => editor.chain().focus().toggleStrike().run(),
      preesed: editor.isActive('strike'),
    },
    {
      icon: <AlignLeft className="size-4" />,
      onClick: () => editor.chain().focus().setTextAlign('left').run(),
      preesed: editor.isActive({ textAlign: 'left' }),
    },
    {
      icon: <AlignCenter className="size-4" />,
      onClick: () => editor.chain().focus().setTextAlign('center').run(),
      preesed: editor.isActive({ textAlign: 'center' }),
    },
    {
      icon: <AlignRight className="size-4" />,
      onClick: () => editor.chain().focus().setTextAlign('right').run(),
      preesed: editor.isActive({ textAlign: 'right' }),
    },
    {
      icon: <List className="size-4" />,
      onClick: () => editor.chain().focus().toggleBulletList().run(),
      preesed: editor.isActive('bulletList'),
    },
    {
      icon: <ListOrdered className="size-4" />,
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
      preesed: editor.isActive('orderedList'),
    },
    {
      icon: <Highlighter className="size-4" />,
      onClick: () => editor.chain().focus().toggleHighlight().run(),
      preesed: editor.isActive('highlight'),
    },
  ];

  return (
    <div className="bg-foreground/5 z-50 mb-1 space-x-2 rounded-md border border-slate-200 p-1 dark:border-gray-950 flex items-center justify-between">
      <div className="flex items-center space-x-2">
        {Options.map((option, index) => (
          <Toggle
            key={index}
            pressed={option.preesed}
            onPressedChange={option.onClick}
            className="data-[state=on]:bg-slate-200 dark:data-[state=on]:bg-black"
          >
            {option.icon}
          </Toggle>
        ))}
      </div>
      {hasChanges ? (<Button
          variant="ghost"
          size="sm"
          onClick={onSave}
          className="ml-2"
        >
          <Save className="size-4 mr-2" />
          Save
        </Button>
      ) : (
        <Button variant="ghost" size="sm" disabled className="ml-2">
          <Check className="size-4 mr-2" />
          Saved
        </Button>
      )}
    </div>
  );
}
