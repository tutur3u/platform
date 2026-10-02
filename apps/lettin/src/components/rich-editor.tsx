'use client';
import type { LettinNode } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import {
  parseEditorMarkdown,
  RichTextEditor,
  serializeEditorMarkdown,
} from '@tuturuuu/ui/text-editor/editor';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { JSONContent } from '@tuturuuu/ui/tiptap';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

function documentNode(node: JSONContent): LettinNode {
  return {
    type: node.type ?? 'paragraph',
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(node.attrs ? { attrs: node.attrs } : {}),
    ...(node.marks ? { marks: node.marks } : {}),
    ...(node.content ? { content: node.content.map(documentNode) } : {}),
  };
}
export function RichEditor({
  value,
  onChange,
  onImageUpload,
  onSourceModeChange,
  readOnly = false,
}: {
  readOnly?: boolean;
  value: LettinNode;
  onChange: (content: LettinNode) => void;
  onImageUpload?: (file: File) => Promise<string>;
  onSourceModeChange?: (editing: boolean) => void;
}) {
  const t = useTranslations('lettin');
  const editorRef = useRef<
    Parameters<typeof serializeEditorMarkdown>[0] | null
  >(null);
  const [source, setSource] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="wiki-text-editor">
      <div className="wiki-editor-mode">
        <span>{t('content')}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!ready || readOnly}
          onClick={() => {
            const editor = editorRef.current;
            if (!editor) return;
            if (source === null) {
              setSource(serializeEditorMarkdown(editor));
              onSourceModeChange?.(true);
            } else {
              try {
                editor.commands.setContent(
                  parseEditorMarkdown(
                    source.replace(
                      /\]\((\/api\/v1\/lettin\/media\/[0-9a-f-]{36})(?=[)\s])/g,
                      '](https://lettin.tuturuuu.com$1'
                    )
                  )
                );
                onChange(documentNode(editor.getJSON()));
                setSource(null);
                setError(false);
                onSourceModeChange?.(false);
              } catch {
                setError(true);
              }
            }
          }}
        >
          {t(source === null ? 'editMarkdown' : 'applyMarkdown')}
        </Button>
        {source !== null && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setSource(null);
              setError(false);
              onSourceModeChange?.(false);
            }}
          >
            {t('cancel')}
          </Button>
        )}
      </div>
      {source !== null && (
        <label className="block p-4">
          <span className="sr-only">{t('markdownSource')}</span>
          <Textarea
            className="min-h-80 font-mono"
            value={source}
            disabled={readOnly}
            maxLength={100000}
            onChange={(e) => setSource(e.target.value)}
          />
          <p className="mt-2 text-muted-foreground text-xs">
            {t('markdownHint')}
          </p>
          {error && <p role="alert">{t('requestFailed')}</p>}
        </label>
      )}
      <div hidden={source !== null}>
        <RichTextEditor
          readOnly={readOnly}
          onEditorReady={() => setReady(true)}
          content={value}
          onImmediateChange={(content) =>
            onChange(documentNode(content ?? { type: 'doc', content: [] }))
          }
          editorRef={editorRef}
          onImageUpload={onImageUpload}
          allowCollaboration={false}
          allowEmbeds={false}
          writePlaceholder={t('writeWiki')}
          titlePlaceholder={t('title')}
          saveButtonLabel={t('saveDraft')}
          savedButtonLabel={t('saved')}
          toggleBlockLabel={t('toggleBlock')}
        />
      </div>
    </div>
  );
}
