'use client';

import { Extension } from '@tiptap/core';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { extractPlainText } from './codec.js';
import { Collapsible, CollapsibleSummary } from './collapsible.js';
import { EditorToolbar } from './editor-toolbar.js';
import { editorMessages } from './messages.js';
import type {
  EditorLocale,
  EditorMessages,
  JSONContent,
  RichTextFeaturePreset,
  RichTextStylePolicy,
} from './types.js';

type InternalPreset = RichTextFeaturePreset | 'legacy';

export function RichTextEditor({
  content,
  enableHTMLSource: legacyFullPreset = false,
  featurePreset,
  locale = 'en',
  messages: messageOverrides,
  onChange,
  onImageUpload,
  onImageUploadError,
  onSourceModeDirtyChange,
  placeholder,
  readOnly = false,
  stylePolicy,
  toolbarEnd,
}: {
  content: JSONContent | null;
  /** @deprecated Editing is always a live WYSIWYG experience. */
  enableHTMLSource?: boolean;
  /** @deprecated Editing is now always a live WYSIWYG experience. */
  enablePreview?: boolean;
  featurePreset?: RichTextFeaturePreset;
  locale?: EditorLocale;
  messages?: Partial<Omit<EditorMessages, 'words'>>;
  onChange?: (content: JSONContent | null) => void;
  onImageUpload?: (file: File) => Promise<string>;
  onImageUploadError?: (error: unknown) => void;
  /** @deprecated There is no separate source mode. */
  onSourceModeDirtyChange?: (dirty: boolean) => void;
  placeholder?: string;
  readOnly?: boolean;
  stylePolicy?: RichTextStylePolicy;
  /** Additional product actions rendered in the existing formatting toolbar. */
  toolbarEnd?: ReactNode;
}) {
  const messages = useMemo(
    () => ({ ...editorMessages[locale], ...messageOverrides }),
    [locale, messageOverrides]
  );
  const preset: InternalPreset =
    featurePreset ?? (legacyFullPreset ? 'full' : 'legacy');
  const enhanced = preset !== 'legacy';
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => onSourceModeDirtyChange?.(false), [onSourceModeDirtyChange]);

  const resolvedPlaceholder = placeholder ?? messages.placeholder;
  const extensions = useMemo(() => {
    const full = preset !== 'compact';
    const headingLevels =
      preset === 'full' ? [1, 2, 3, 4] : preset === 'legacy' ? [1, 2, 3] : [];
    return [
      StarterKit.configure({
        blockquote: full ? undefined : false,
        bulletList: full ? undefined : false,
        heading: full ? { levels: headingLevels as [1, 2, 3, 4] } : false,
        horizontalRule: full ? undefined : false,
        link: false,
        listItem: full ? undefined : false,
        orderedList: full ? undefined : false,
      }),
      Link.configure({ openOnClick: false }),
      ...(full ? [Image] : []),
      ...(preset === 'full'
        ? [
            CollapsibleSummary.configure({
              disclosureLabel: messages.collapsibleDisclosure,
            }),
            Collapsible,
          ]
        : []),
      ...(enhanced && stylePolicy?.alignments?.length
        ? [TextAlign.configure({ types: ['heading', 'paragraph'] })]
        : []),
      ...(enhanced && stylePolicy?.textTones?.length ? [TextStyle, Color] : []),
      ...(enhanced && stylePolicy?.highlights?.length
        ? [Highlight.configure({ multicolor: true })]
        : []),
      Extension.create({
        name: 'collapsiblePlaceholder',
        addProseMirrorPlugins() {
          const editor = this.editor;
          return [
            new Plugin({
              props: {
                decorations(state) {
                  if (!editor.isEditable) return DecorationSet.empty;
                  const decorations: Decoration[] = [];
                  state.doc.descendants((node, pos, parent) => {
                    if (
                      node.type.name === 'collapsibleSummary' &&
                      node.content.size === 0
                    ) {
                      decorations.push(
                        Decoration.node(pos, pos + node.nodeSize, {
                          'data-placeholder': messages.collapsibleTitle,
                          class: 'is-empty',
                        })
                      );
                    }
                    if (
                      node.type.name === 'paragraph' &&
                      node.content.size === 0 &&
                      parent?.type.name === 'collapsible'
                    ) {
                      decorations.push(
                        Decoration.node(pos, pos + node.nodeSize, {
                          'data-placeholder': messages.collapsiblePlaceholder,
                          class: 'is-empty',
                        })
                      );
                    }
                  });
                  return DecorationSet.create(state.doc, decorations);
                },
              },
            }),
          ];
        },
      }),
      Placeholder.configure({
        includeChildren: true,
        placeholder: resolvedPlaceholder,
        showOnlyCurrent: false,
      }),
    ];
  }, [
    enhanced,
    messages.collapsibleDisclosure,
    messages.collapsiblePlaceholder,
    messages.collapsibleTitle,
    preset,
    resolvedPlaceholder,
    stylePolicy?.alignments,
    stylePolicy?.highlights,
    stylePolicy?.textTones,
  ]);

  const schemaKey = [
    preset,
    stylePolicy?.alignments?.length ? 'align' : '',
    stylePolicy?.textTones?.length ? 'tones' : '',
    stylePolicy?.highlights?.length ? 'highlights' : '',
    resolvedPlaceholder,
    messages.collapsibleDisclosure,
    messages.collapsiblePlaceholder,
  ].join(':');
  const editor = useEditor(
    {
      content: content ?? { type: 'doc', content: [] },
      editable: !readOnly,
      extensions,
      immediatelyRender: false,
      onUpdate: ({ editor: current }) =>
        onChangeRef.current?.(current.getJSON()),
    },
    [schemaKey]
  );

  useEffect(() => {
    const editable = !readOnly;
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable, false);
      editor.view.dom.querySelectorAll('details').forEach((details) => {
        details.open = editable;
      });
    }
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    const next = content ?? { content: [], type: 'doc' };
    const incoming = JSON.stringify(next);
    const current = JSON.stringify(editor.getJSON());
    if (current !== incoming)
      editor.commands.setContent(next, { emitUpdate: false });
  }, [content, editor]);

  const words = useMemo(() => {
    if (!editor) return 0;
    return extractPlainText(editor.getJSON()).split(/\s+/u).filter(Boolean)
      .length;
  }, [editor, editor?.state.doc]);

  if (!editor)
    return <div aria-busy="true" className="tuturuuu-editor-skeleton" />;

  return (
    <div className="tuturuuu-editor" data-read-only={readOnly || undefined}>
      {!readOnly ? (
        <EditorToolbar
          editor={editor}
          messages={messages}
          onImageUpload={onImageUpload}
          onImageUploadError={onImageUploadError}
          preset={preset}
          stylePolicy={stylePolicy}
          toolbarEnd={toolbarEnd}
        />
      ) : null}
      <EditorContent editor={editor} />

      {!readOnly ? (
        <output className="tuturuuu-editor-word-count">
          {editorMessages[locale].words(words)}
        </output>
      ) : null}
    </div>
  );
}

export type { HTMLSourceInspection } from './html-source.js';
export { inspectRichTextHTML } from './html-source.js';
export type {
  JSONContent,
  RichTextFeaturePreset,
  RichTextStylePolicy,
} from './types.js';
