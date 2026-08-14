'use client';

import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { extractPlainText } from './codec.js';
import { EditorToolbar } from './editor-toolbar.js';
import { inspectRichTextHTML } from './html-source.js';
import {
  type EditorMode,
  EditorModeSwitch,
  HTMLSourcePanel,
} from './html-source-panel.js';
import { editorMessages } from './messages.js';
import { sanitizeRichTextContent } from './render.js';
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
  enableHTMLSource = false,
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
}: {
  content: JSONContent | null;
  enableHTMLSource?: boolean;
  /** @deprecated Editing is now always a live WYSIWYG experience. */
  enablePreview?: boolean;
  featurePreset?: RichTextFeaturePreset;
  locale?: EditorLocale;
  messages?: Partial<Omit<EditorMessages, 'words'>>;
  onChange?: (content: JSONContent | null) => void;
  onImageUpload?: (file: File) => Promise<string>;
  onImageUploadError?: (error: unknown) => void;
  onSourceModeDirtyChange?: (dirty: boolean) => void;
  placeholder?: string;
  readOnly?: boolean;
  stylePolicy?: RichTextStylePolicy;
}) {
  const messages = useMemo(
    () => ({ ...editorMessages[locale], ...messageOverrides }),
    [locale, messageOverrides]
  );
  const preset: InternalPreset =
    featurePreset ?? (enableHTMLSource ? 'full' : 'legacy');
  const enhanced = preset !== 'legacy';
  const [mode, setMode] = useState<EditorMode>('editor');
  const [source, setSource] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  const sourceBaseline = useRef('');
  const sourceId = useId();
  const sourceFeedbackId = `${sourceId}-feedback`;
  const onChangeRef = useRef(onChange);
  const onSourceModeDirtyChangeRef = useRef(onSourceModeDirtyChange);
  const pendingAppliedContent = useRef<{
    incoming: string;
    value: string;
  } | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSourceModeDirtyChangeRef.current = onSourceModeDirtyChange;
  }, [onSourceModeDirtyChange]);

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
      ...(enhanced && stylePolicy?.alignments?.length
        ? [TextAlign.configure({ types: ['heading', 'paragraph'] })]
        : []),
      ...(enhanced && stylePolicy?.textTones?.length ? [TextStyle, Color] : []),
      ...(enhanced && stylePolicy?.highlights?.length
        ? [Highlight.configure({ multicolor: true })]
        : []),
      Placeholder.configure({
        placeholder: resolvedPlaceholder,
      }),
    ];
  }, [
    enhanced,
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

  const sourceDirty = source !== sourceBaseline.current;

  useEffect(() => {
    const editable = !readOnly && mode === 'editor';
    if (editor && editor.isEditable !== editable)
      editor.setEditable(editable, false);
  }, [editor, mode, readOnly]);

  useEffect(() => {
    onSourceModeDirtyChangeRef.current?.(sourceDirty);
  }, [sourceDirty]);

  useEffect(() => {
    const modeUnavailable = readOnly || (mode === 'html' && !enableHTMLSource);
    if (!editor || mode === 'editor' || !modeUnavailable) return;
    const html = editor.getHTML();
    sourceBaseline.current = html;
    setSource(html);
    setSourceError(null);
    setSourceNotice(null);
    setMode('editor');
  }, [editor, enableHTMLSource, mode, readOnly]);

  useEffect(() => {
    if (!editor || sourceDirty) return;
    const next = content ?? { content: [], type: 'doc' };
    const incoming = JSON.stringify(next);
    const current = JSON.stringify(editor.getJSON());
    const pending = pendingAppliedContent.current;

    if (pending) {
      if (incoming === pending.value) pendingAppliedContent.current = null;
      else if (incoming === pending.incoming && current === pending.value)
        return;
      else if (incoming !== pending.incoming)
        pendingAppliedContent.current = null;
    }

    if (current !== incoming) {
      editor.commands.setContent(next, { emitUpdate: false });
      if (mode === 'html') {
        const nextSource = editor.getHTML();
        sourceBaseline.current = nextSource;
        setSource(nextSource);
      }
    }
  }, [content, editor, mode, sourceDirty]);

  const words = useMemo(() => {
    if (!editor) return 0;
    return extractPlainText(editor.getJSON()).split(/\s+/u).filter(Boolean)
      .length;
  }, [editor, editor?.state.doc]);

  if (!editor)
    return <div aria-busy="true" className="tuturuuu-editor-skeleton" />;

  const enterHTMLMode = () => {
    if (!sourceDirty) {
      const html = editor.getHTML();
      sourceBaseline.current = html;
      setSource(html);
    }
    setSourceError(null);
    setSourceNotice(null);
    setMode('html');
  };

  const enterEditorMode = () => {
    if (sourceDirty) {
      setSourceError(messages.htmlChangesPending);
      return;
    }
    setSourceError(null);
    setMode('editor');
  };

  const discardSource = () => {
    const html = editor.getHTML();
    sourceBaseline.current = html;
    setSource(html);
    setSourceError(null);
    setSourceNotice(null);
    setMode('editor');
  };

  const applySource = () => {
    try {
      const inspection = inspectRichTextHTML(source, document, {
        featurePreset: preset === 'legacy' ? 'full' : preset,
        stylePolicy,
      });
      if (inspection.unsafe) {
        setSourceError(messages.sourceUnsafe);
        setSourceNotice(null);
        return;
      }

      editor.commands.setContent(inspection.html, { emitUpdate: false });
      const safeContent = sanitizeRichTextContent(editor.getJSON(), {
        featurePreset: preset === 'legacy' ? 'full' : preset,
        stylePolicy,
      });
      editor.commands.setContent(safeContent, { emitUpdate: false });
      const normalizedHTML = editor.getHTML();
      pendingAppliedContent.current = {
        incoming: JSON.stringify(content ?? { content: [], type: 'doc' }),
        value: JSON.stringify(safeContent),
      };
      sourceBaseline.current = normalizedHTML;
      setSource(normalizedHTML);
      setSourceError(null);
      setSourceNotice(
        inspection.normalized || normalizedHTML !== inspection.html
          ? messages.htmlNormalized
          : null
      );
      onChangeRef.current?.(safeContent);
    } catch {
      setSourceError(messages.sourceUnsafe);
      setSourceNotice(null);
    }
  };

  return (
    <div
      className="tuturuuu-editor"
      data-mode={mode}
      data-read-only={readOnly || undefined}
    >
      {!readOnly && enableHTMLSource ? (
        <EditorModeSwitch
          enableHTMLSource={enableHTMLSource}
          messages={messages}
          mode={mode}
          onEditor={enterEditorMode}
          onHTML={enterHTMLMode}
        />
      ) : null}

      {mode !== 'html' || readOnly || !enableHTMLSource ? (
        <>
          {!readOnly && mode === 'editor' ? (
            <EditorToolbar
              editor={editor}
              messages={messages}
              onImageUpload={onImageUpload}
              onImageUploadError={onImageUploadError}
              preset={preset}
              stylePolicy={stylePolicy}
            />
          ) : null}
          <EditorContent editor={editor} />
        </>
      ) : (
        <HTMLSourcePanel
          feedbackId={sourceFeedbackId}
          messages={messages}
          onApply={applySource}
          onChange={(value) => {
            setSource(value);
            setSourceError(null);
            setSourceNotice(null);
          }}
          onDiscard={discardSource}
          source={source}
          sourceDirty={sourceDirty}
          sourceError={sourceError}
          sourceId={sourceId}
          sourceNotice={sourceNotice}
        />
      )}

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
