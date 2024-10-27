'use client';

import { defaultEditorContent } from './content';
import { defaultExtensions } from './extensions';
import GenerativeMenuSwitch from './generative/generative-menu-switch';
import { uploadFn } from './image-upload';
import { ColorSelector } from './selectors/color-selector';
import { LinkSelector } from './selectors/link-selector';
import { MathSelector } from './selectors/math-selector';
import { NodeSelector } from './selectors/node-selector';
import { TextButtons } from './selectors/text-buttons';
import { slashCommand, suggestionItems } from './slash-command';
import { cn } from '@/lib/utils';
import { Separator } from '@repo/ui/components/ui/separator';
import { CircleCheck, CircleDashed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorCommandList,
  EditorContent,
  type EditorInstance,
  EditorRoot,
  type JSONContent,
} from 'novel';
import { ImageResizer, handleCommandNavigation } from 'novel/extensions';
import { handleImageDrop, handleImagePaste } from 'novel/plugins';
import { useEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

const hljs = require('highlight.js');

const extensions = [...defaultExtensions, slashCommand];

export const TailwindAdvancedEditor = ({
  content,
  previewMode = false,
  disableLocalStorage,
  onSave,
}: {
  content?: JSONContent | undefined;
  previewMode?: boolean;
  disableLocalStorage?: boolean;
  // eslint-disable-next-line no-unused-vars
  onSave?: (data: JSONContent) => Promise<void>;
}) => {
  const t = useTranslations();

  const [initialContent, setInitialContent] = useState<null | JSONContent>(
    null
  );

  useEffect(() => {
    setInitialContent(content || defaultEditorContent);
  }, [content]);

  const [saveStatus, setSaveStatus] = useState(t('common.saved'));
  const [charsCount, setCharsCount] = useState<number | undefined>();

  const [openNode, setOpenNode] = useState(false);
  const [openColor, setOpenColor] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [openAI, setOpenAI] = useState(false);

  const highlightCodeblocks = (content: string) => {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    doc.querySelectorAll('pre code').forEach((el) => {
      hljs.highlightElement(el);
    });
    return new XMLSerializer().serializeToString(doc);
  };

  const debouncedUpdates = useDebouncedCallback(
    async (editor: EditorInstance) => {
      const json = editor.getJSON();
      setCharsCount(editor.storage.characterCount.words());

      window.localStorage.setItem(
        'html-content',
        highlightCodeblocks(editor.getHTML())
      );
      window.localStorage.setItem('novel-content', JSON.stringify(json));
      window.localStorage.setItem(
        'markdown',
        editor.storage.markdown.getMarkdown()
      );
      if (onSave) await onSave(json);
      setSaveStatus(t('common.saved'));
    },
    500
  );

  useEffect(() => {
    if (disableLocalStorage) return;
    const content = window.localStorage.getItem('novel-content');
    if (content) setInitialContent(JSON.parse(content));
    else setInitialContent(defaultEditorContent);
  }, [disableLocalStorage]);

  if (!initialContent) return <div>{t('common.loading')}...</div>;

  return (
    <div className="relative w-full">
      {previewMode || (
        <div className="absolute right-5 top-5 z-10 mb-5 flex gap-2">
          <div className="bg-accent text-muted-foreground flex items-center gap-1 rounded-lg px-2 py-1 text-sm">
            {saveStatus}
            {saveStatus === t('common.saved') ? (
              <CircleCheck className="h-3 w-3" />
            ) : (
              <CircleDashed className="h-3 w-3" />
            )}
          </div>
          {charsCount !== undefined && (
            <div
              className={
                charsCount
                  ? 'bg-accent text-muted-foreground rounded-lg px-2 py-1 text-sm'
                  : 'hidden'
              }
            >
              {charsCount}{' '}
              {charsCount > 1 ? t('common.words') : t('common.word')}
            </div>
          )}
        </div>
      )}
      <EditorRoot>
        <EditorContent
          editable={!previewMode}
          initialContent={initialContent}
          extensions={extensions}
          className={cn(
            'relative w-full',
            previewMode
              ? 'bg-transparent'
              : 'border-foreground/10 bg-foreground/5 mb-[calc(20vh)] min-h-[500px] rounded-lg border p-2 shadow-lg md:p-4'
          )}
          editorProps={{
            handleDOMEvents: {
              keydown: (_view, event) => handleCommandNavigation(event),
            },
            handlePaste: (view, event) =>
              handleImagePaste(view, event, uploadFn),
            handleDrop: (view, event, _slice, moved) =>
              handleImageDrop(view, event, moved, uploadFn),
            attributes: {
              class:
                'prose prose-lg dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full',
            },
          }}
          onCreate={({ editor }) => {
            debouncedUpdates(editor);
            setSaveStatus(t('common.saved'));
          }}
          onUpdate={({ editor }) => {
            debouncedUpdates(editor);
            setSaveStatus(t('common.unsaved'));
          }}
          slotAfter={<ImageResizer />}
        >
          <EditorCommand className="border-muted bg-background z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border px-1 py-2 shadow-md transition-all">
            <EditorCommandEmpty className="text-muted-foreground px-2">
              No results
            </EditorCommandEmpty>
            <EditorCommandList>
              {suggestionItems.map((item) => (
                <EditorCommandItem
                  value={item.title}
                  onCommand={(val) => item?.command?.(val)}
                  className="hover:bg-accent aria-selected:bg-accent flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm"
                  key={item.title}
                >
                  <div className="border-muted bg-background flex h-10 w-10 items-center justify-center rounded-md border">
                    {item.icon}
                  </div>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {item.description}
                    </p>
                  </div>
                </EditorCommandItem>
              ))}
            </EditorCommandList>
          </EditorCommand>

          <GenerativeMenuSwitch open={openAI} onOpenChange={setOpenAI}>
            <NodeSelector open={openNode} onOpenChange={setOpenNode} />
            <Separator orientation="vertical" />
            <LinkSelector open={openLink} onOpenChange={setOpenLink} />
            <Separator orientation="vertical" />
            <MathSelector />
            <Separator orientation="vertical" />
            <TextButtons />
            <Separator orientation="vertical" />
            <ColorSelector open={openColor} onOpenChange={setOpenColor} />
          </GenerativeMenuSwitch>
        </EditorContent>
      </EditorRoot>
    </div>
  );
};
