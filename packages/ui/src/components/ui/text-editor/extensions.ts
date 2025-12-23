import { InputRule } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import Highlight from '@tiptap/extension-highlight';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Link from '@tiptap/extension-link';
import { TaskList } from '@tiptap/extension-list';
import Placeholder from '@tiptap/extension-placeholder';
import Strike from '@tiptap/extension-strike';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TextAlign from '@tiptap/extension-text-align';
import Youtube from '@tiptap/extension-youtube';
import type { Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type SupabaseProvider from '@tuturuuu/ui/hooks/supabase-provider';
import type * as Y from 'yjs';
import { CustomImage } from './image-extension';
import { ListConverter } from './list-converter-extension';
import {
  DraggableListItem,
  DraggableTaskItem,
  ListItemDrag,
} from './list-item-drag-extension';
import { Mention } from './mention-extension';
import { Video } from './video-extension';

interface EditorExtensionsOptions {
  titlePlaceholder?: string;
  writePlaceholder?: string;
  doc?: Y.Doc | null;
  provider?: SupabaseProvider | null;
  onImageUpload?: (file: File) => Promise<string>;
  onVideoUpload?: (file: File) => Promise<string>;
}

export function getEditorExtensions({
  titlePlaceholder = 'What is the title?',
  writePlaceholder = 'Write something...',
  doc = null,
  provider = null,
  onImageUpload,
  onVideoUpload,
}: EditorExtensionsOptions = {}): Extensions {
  return [
    ...(doc
      ? [
          Collaboration.configure({
            document: doc,
            field: 'prosemirror',
          }),
        ]
      : []),
    ...(provider
      ? [
          CollaborationCaret.configure({
            provider: provider,
          }),
        ]
      : []),
    StarterKit.configure({
      link: false,
      strike: false,
      horizontalRule: false, // Disable default to use custom config
      listItem: false, // Disable default to use draggable version
      undoRedo: doc ? false : undefined,
      bulletList: {
        HTMLAttributes: {
          class: 'list-disc ml-3',
        },
      },
      orderedList: {
        HTMLAttributes: {
          class: 'list-decimal ml-3',
        },
      },
    }),
    HorizontalRule.extend({
      addInputRules() {
        return [
          new InputRule({
            find: /^---$/,
            handler: ({ state, range: _, chain }) => {
              const { $from } = state.selection;

              // Get the position of the paragraph containing "---"
              const paragraphDepth = $from.depth;
              const paragraphPos = $from.before(paragraphDepth);
              const paragraphEndPos = $from.after(paragraphDepth);

              // Replace the entire paragraph with just the horizontal rule
              chain()
                .deleteRange({ from: paragraphPos, to: paragraphEndPos })
                .insertContentAt(paragraphPos, { type: 'horizontalRule' })
                .run();
            },
          }),
        ];
      },
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') {
          return titlePlaceholder;
        }
        return writePlaceholder;
      },
      emptyNodeClass: 'is-empty',
    }),
    Highlight,
    Link.configure({
      openOnClick: true,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      HTMLAttributes: {
        class:
          'text-dynamic-cyan hover:text-dynamic-cyan/80 underline cursor-pointer transition-colors',
        rel: 'noopener noreferrer',
        target: '_blank',
      },
      validate: (href) => {
        // Allow http/https URLs and mailto links
        return /^https?:\/\/.+/.test(href) || /^mailto:.+@.+\..+/.test(href);
      },
      protocols: ['http', 'https', 'mailto'],
      shouldAutoLink: () => {
        // Auto-link URLs but not in code blocks
        return true;
      },
    }),
    Strike,
    Subscript,
    Superscript,
    Mention,
    DraggableListItem,
    DraggableTaskItem.configure({
      nested: true,
    }),
    TaskList,
    ListConverter,
    ListItemDrag,
    Table.configure({
      resizable: true,
      lastColumnResizable: true,
      allowTableNodeSelection: true,
      HTMLAttributes: {
        class:
          'border-collapse my-6 w-full overflow-hidden rounded-lg border border-dynamic-border',
      },
    }),
    TableRow.configure({
      HTMLAttributes: {
        class: 'border-b border-dynamic-border last:border-0',
      },
    }),
    TableHeader.configure({
      HTMLAttributes: {
        class:
          'relative border-r border-dynamic-border bg-dynamic-border/30 px-4 py-3 text-left font-semibold text-foreground last:border-r-0 [&>p]:my-0',
      },
    }),
    TableCell.configure({
      HTMLAttributes: {
        class:
          'relative border-r border-dynamic-border px-4 py-3 last:border-r-0 [&>p]:my-0 hover:bg-dynamic-surface/50 focus:bg-dynamic-surface/70 focus:outline-none focus:ring-2 focus:ring-dynamic-blue/50 focus:ring-inset',
      },
    }),
    CustomImage({ onImageUpload }),
    Video({ onVideoUpload }).configure({
      HTMLAttributes: {
        class: 'rounded-md my-4',
      },
    }),
    Youtube.configure({
      controls: true,
      nocookie: true,
      width: 640,
      height: 360,
      HTMLAttributes: {
        class: 'rounded-md my-4',
      },
    }),
  ];
}
