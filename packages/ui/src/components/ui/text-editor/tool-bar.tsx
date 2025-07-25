import type { Editor } from '@tiptap/react';
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
  Link,
  List,
  ListOrdered,
  Save,
  Strikethrough,
  Subscript,
  Superscript,
} from '@tuturuuu/ui/icons';
import { Toggle } from '@tuturuuu/ui/toggle';

interface ToolBarProps {
  editor: Editor | null;
  hasChanges: boolean;
  onSave: () => void;
  saveButtonLabel?: string;
  savedButtonLabel?: string;
}

export function ToolBar({
  editor,
  hasChanges,
  onSave,
  saveButtonLabel,
  savedButtonLabel,
}: ToolBarProps) {
  if (!editor) {
    return null;
  }

  const Options = [
    {
      icon: <Heading1 className="size-4" />,
      onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      pressed: editor.isActive('heading', { level: 1 }),
    },
    {
      icon: <Heading2 className="size-4" />,
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      pressed: editor.isActive('heading', { level: 2 }),
    },
    {
      icon: <Heading3 className="size-4" />,
      onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      pressed: editor.isActive('heading', { level: 3 }),
    },
    {
      icon: <Bold className="size-4" />,
      onClick: () => editor.chain().focus().toggleBold().run(),
      pressed: editor.isActive('bold'),
    },
    {
      icon: <Italic className="size-4" />,
      onClick: () => editor.chain().focus().toggleItalic().run(),
      pressed: editor.isActive('italic'),
    },
    {
      icon: <Strikethrough className="size-4" />,
      onClick: () => editor.chain().focus().toggleStrike().run(),
      pressed: editor.isActive('strike'),
    },
    {
      icon: <Link className="size-4" />,
      onClick: () => {
        const isLinkActive = editor.isActive('link');

        if (isLinkActive) {
          // Get current link URL
          const currentUrl = editor.getAttributes('link').href;

          // Show dialog with options to edit or remove
          const userChoice = window.confirm(
            `Current link: ${currentUrl}\n\nClick OK to edit this link, or Cancel to remove it.`
          );

          if (userChoice) {
            // User wants to edit the link
            const newUrl = window.prompt('Edit link URL:', currentUrl);

            if (newUrl === null) {
              // User cancelled
              return;
            }

            if (newUrl.trim() === '') {
              // Empty URL means remove link
              editor.chain().focus().unsetLink().run();
              return;
            }

            // Format the URL properly
            let formattedUrl = newUrl.trim();
            if (
              !formattedUrl.match(/^https?:\/\//) &&
              !formattedUrl.match(/^mailto:/)
            ) {
              // Add https:// if no protocol specified
              formattedUrl = `https://${formattedUrl}`;
            }

            // Update the link
            editor.chain().focus().setLink({ href: formattedUrl }).run();
          } else {
            // User wants to remove the link
            editor.chain().focus().unsetLink().run();
          }
        } else {
          // No link is active, create a new one
          const { from, to } = editor.state.selection;
          const selectedText = editor.state.doc.textBetween(from, to);

          if (selectedText.trim()) {
            // Text is selected, ask for URL
            const url = window.prompt('Enter URL for the selected text:');

            if (url === null || url.trim() === '') {
              return; // User cancelled or entered empty URL
            }

            // Format the URL properly
            let formattedUrl = url.trim();
            if (
              !formattedUrl.match(/^https?:\/\//) &&
              !formattedUrl.match(/^mailto:/)
            ) {
              formattedUrl = `https://${formattedUrl}`;
            }

            editor.chain().focus().setLink({ href: formattedUrl }).run();
          } else {
            // No text selected, ask for both URL and text
            const url = window.prompt('Enter URL:');

            if (url === null || url.trim() === '') {
              return; // User cancelled or entered empty URL
            }

            const linkText = window.prompt('Enter text to display:', url);

            if (linkText === null) {
              return; // User cancelled
            }

            // Format the URL properly
            let formattedUrl = url.trim();
            if (
              !formattedUrl.match(/^https?:\/\//) &&
              !formattedUrl.match(/^mailto:/)
            ) {
              formattedUrl = `https://${formattedUrl}`;
            }

            // Insert the link with custom text
            const displayText = linkText.trim() || formattedUrl;
            editor
              .chain()
              .focus()
              .insertContent(`<a href="${formattedUrl}">${displayText}</a> `)
              .run();
          }
        }
      },
      pressed: editor.isActive('link'),
    },
    {
      icon: <Subscript className="size-4" />,
      onClick: () => editor.chain().focus().toggleSubscript().run(),
      pressed: editor.isActive('subscript'),
    },
    {
      icon: <Superscript className="size-4" />,
      onClick: () => editor.chain().focus().toggleSuperscript().run(),
      pressed: editor.isActive('superscript'),
    },
    {
      icon: <AlignLeft className="size-4" />,
      onClick: () => editor.chain().focus().setTextAlign('left').run(),
      pressed: editor.isActive({ textAlign: 'left' }),
    },
    {
      icon: <AlignCenter className="size-4" />,
      onClick: () => editor.chain().focus().setTextAlign('center').run(),
      pressed: editor.isActive({ textAlign: 'center' }),
    },
    {
      icon: <AlignRight className="size-4" />,
      onClick: () => editor.chain().focus().setTextAlign('right').run(),
      pressed: editor.isActive({ textAlign: 'right' }),
    },
    {
      icon: <List className="size-4" />,
      onClick: () => editor.chain().focus().toggleBulletList().run(),
      pressed: editor.isActive('bulletList'),
    },
    {
      icon: <ListOrdered className="size-4" />,
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
      pressed: editor.isActive('orderedList'),
    },
    {
      icon: <Highlighter className="size-4" />,
      onClick: () => editor.chain().focus().toggleHighlight().run(),
      pressed: editor.isActive('highlight'),
    },
  ];

  return (
    <div className="z-50 mb-1 flex items-center justify-between space-x-2 rounded-md border border-slate-200 bg-foreground/5 p-1 dark:border-gray-950">
      <div className="flex items-center space-x-2">
        {Options.map((option, index) => (
          <Toggle
            key={index}
            pressed={option.pressed}
            onPressedChange={option.onClick}
            className="data-[state=on]:bg-slate-200 dark:data-[state=on]:bg-black"
          >
            {option.icon}
          </Toggle>
        ))}
      </div>
      {saveButtonLabel &&
        savedButtonLabel &&
        (hasChanges ? (
          <Button variant="ghost" size="sm" onClick={onSave} className="ml-2">
            <Save className="mr-2 size-4" />
            {saveButtonLabel}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled className="ml-2">
            <Check className="mr-2 size-4" />
            {savedButtonLabel}
          </Button>
        ))}
    </div>
  );
}
