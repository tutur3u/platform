'use client';

import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  ListTree,
  Minus,
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ImageUploadControl } from './image-upload-control.js';
import { LinkToolbarControl } from './link-toolbar-control.js';
import { StyleToolbarControl } from './style-toolbar-control.js';
import type { ToolbarIcon } from './toolbar-action.js';
import { ToolbarAction } from './toolbar-action.js';
import type {
  EditorMessages,
  RichTextFeaturePreset,
  RichTextStylePolicy,
} from './types.js';

type InternalPreset = RichTextFeaturePreset | 'legacy';

export function EditorToolbar({
  editor,
  messages,
  onImageUpload,
  onImageUploadError,
  preset,
  stylePolicy,
  toolbarEnd,
}: {
  editor: Editor;
  messages: EditorMessages;
  onImageUpload?: (file: File) => Promise<string>;
  onImageUploadError?: (error: unknown) => void;
  preset: InternalPreset;
  stylePolicy?: RichTextStylePolicy;
  toolbarEnd?: ReactNode;
}) {
  const enhanced = preset !== 'legacy';
  const action = (
    label: string,
    icon: ToolbarIcon,
    run: () => void,
    active?: boolean
  ) => (
    <ToolbarAction
      active={active}
      icon={icon}
      key={label}
      label={label}
      run={run}
    />
  );
  const headingActions: Array<[1 | 2 | 3 | 4, string, ToolbarIcon]> =
    preset === 'full'
      ? [
          [1, messages.heading1 ?? `${messages.heading} 1`, Heading1],
          [2, messages.heading2 ?? `${messages.heading} 2`, Heading2],
          [3, messages.heading3 ?? `${messages.heading} 3`, Heading3],
          [4, messages.heading4 ?? `${messages.heading} 4`, Heading4],
        ]
      : [
          [1, messages.heading1 ?? `${messages.heading} 1`, Heading1],
          [2, messages.heading2 ?? `${messages.heading} 2`, Heading2],
          [3, messages.heading3 ?? `${messages.heading} 3`, Heading3],
        ];
  const textTone = String(editor.getAttributes('textStyle').color ?? '');
  const highlight = String(editor.getAttributes('highlight').color ?? '');

  return (
    <div
      aria-label={messages.toolbar}
      className="tuturuuu-editor-toolbar"
      role="toolbar"
    >
      {action(
        messages.bold,
        Bold,
        () => editor.chain().focus().toggleBold().run(),
        editor.isActive('bold')
      )}
      {action(
        messages.italic,
        Italic,
        () => editor.chain().focus().toggleItalic().run(),
        editor.isActive('italic')
      )}
      {enhanced
        ? action(
            messages.underline,
            Underline,
            () => editor.chain().focus().toggleUnderline().run(),
            editor.isActive('underline')
          )
        : null}
      {enhanced
        ? action(
            messages.strikethrough,
            Strikethrough,
            () => editor.chain().focus().toggleStrike().run(),
            editor.isActive('strike')
          )
        : null}
      {preset !== 'compact'
        ? headingActions.map(([level, label, icon]) =>
            action(
              label,
              icon,
              () => editor.chain().focus().toggleHeading({ level }).run(),
              editor.isActive('heading', { level })
            )
          )
        : null}
      {preset !== 'compact'
        ? action(
            messages.bulletList,
            List,
            () => editor.chain().focus().toggleBulletList().run(),
            editor.isActive('bulletList')
          )
        : null}
      {preset !== 'compact'
        ? action(
            messages.orderedList,
            ListOrdered,
            () => editor.chain().focus().toggleOrderedList().run(),
            editor.isActive('orderedList')
          )
        : null}
      {preset !== 'compact'
        ? action(
            messages.blockquote,
            Quote,
            () => editor.chain().focus().toggleBlockquote().run(),
            editor.isActive('blockquote')
          )
        : null}
      {preset === 'full'
        ? action(messages.collapsible, ListTree, () =>
            editor
              .chain()
              .focus(undefined, { scrollIntoView: false })
              .insertContent({
                content: [
                  {
                    content: [
                      { text: messages.collapsibleTitle, type: 'text' },
                    ],
                    type: 'collapsibleSummary',
                  },
                  {
                    content: [
                      { text: messages.collapsiblePlaceholder, type: 'text' },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'collapsible',
              })
              .run()
          )
        : null}
      {preset !== 'compact'
        ? action(messages.horizontalRule, Minus, () =>
            editor.chain().focus().setHorizontalRule().run()
          )
        : null}
      <LinkToolbarControl
        active={editor.isActive('link')}
        currentHref={() => {
          const currentHref = editor.getAttributes('link').href;
          return typeof currentHref === 'string' ? currentHref : '';
        }}
        messages={messages}
        onApply={(href) => {
          const chain = editor.chain().focus().extendMarkRange('link');
          if (href) chain.setLink({ href }).run();
          else chain.unsetLink().run();
        }}
      />
      {preset !== 'compact' && onImageUpload ? (
        <ImageUploadControl
          label={messages.image}
          onError={onImageUploadError}
          onInsert={(src) => editor.chain().focus().setImage({ src }).run()}
          onUpload={onImageUpload}
        />
      ) : null}
      {enhanced && stylePolicy?.alignments?.includes('left')
        ? action(
            messages.alignLeft,
            AlignLeft,
            () => editor.chain().focus().setTextAlign('left').run(),
            editor.isActive({ textAlign: 'left' })
          )
        : null}
      {enhanced && stylePolicy?.alignments?.includes('center')
        ? action(
            messages.alignCenter,
            AlignCenter,
            () => editor.chain().focus().setTextAlign('center').run(),
            editor.isActive({ textAlign: 'center' })
          )
        : null}
      {enhanced && stylePolicy?.alignments?.includes('right')
        ? action(
            messages.alignRight,
            AlignRight,
            () => editor.chain().focus().setTextAlign('right').run(),
            editor.isActive({ textAlign: 'right' })
          )
        : null}
      {enhanced ? (
        <StyleToolbarControl
          activeValue={textTone}
          clearLabel={messages.clearTextTone}
          icon={Palette}
          label={messages.textTone}
          onClear={() => editor.chain().focus().unsetColor().run()}
          onSelect={(color) => editor.chain().focus().setColor(color).run()}
          options={stylePolicy?.textTones ?? []}
        />
      ) : null}
      {enhanced ? (
        <StyleToolbarControl
          activeValue={highlight}
          clearLabel={messages.clearHighlight}
          icon={Highlighter}
          label={messages.highlight}
          onClear={() => editor.chain().focus().unsetHighlight().run()}
          onSelect={(color) =>
            editor.chain().focus().setHighlight({ color }).run()
          }
          options={stylePolicy?.highlights ?? []}
        />
      ) : null}
      {toolbarEnd}
      <span aria-hidden="true" className="tuturuuu-editor-toolbar-separator" />
      {action(messages.undo, Undo2, () => editor.chain().focus().undo().run())}
      {action(messages.redo, Redo2, () => editor.chain().focus().redo().run())}
    </div>
  );
}
