'use client';

import { defaultExtensions } from './extensions';
import GenerativeMenuSwitch from './generative/generative-menu-switch';
import { uploadFn } from './image-upload';
import { ColorSelector } from './selectors/color-selector';
import { LinkSelector } from './selectors/link-selector';
import { MathSelector } from './selectors/math-selector';
import { NodeSelector } from './selectors/node-selector';
import { TextButtons } from './selectors/text-buttons';
import { slashCommand, suggestionItems } from './slash-command';
import { createClient } from '@/utils/supabase/client';
import { Separator } from '@repo/ui/components/ui/separator';
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

interface Props {
  documentId: string;
}

const hljs = require('highlight.js');

const extensions = [...defaultExtensions, slashCommand];

// Function to fetch the document content based on the documentId
async function fetchDocumentContent(documentId: string) {
  const supabase = createClient();

  // Fetch the document metadata and content
  const { data: documentData, error: documentError } = await supabase
    .from('workspace_documents')
    .select('id, name, content')
    .eq('id', documentId)
    .single();

  if (documentError || !documentData) {
    throw new Error('Document not found');
  }

  const content =
    typeof documentData.content === 'string'
      ? JSON.parse(documentData.content)
      : documentData.content;
  console.log(content, 'fech content');
  return content;
}

async function saveDocumentContent(documentId: string, documentContent: any) {
  const supabase = createClient();

  const { error } = await supabase
    .from('workspace_documents')
    .update({
      content: JSON.stringify(documentContent), // Ensure this is stringified
    })
    .eq('id', documentId);

  if (error) {
    throw new Error('Error saving document');
  }
}

const TailwindAdvancedEditor = ({ documentId }: Props) => {
  const [initialContent, setInitialContent] = useState<null | JSONContent>(
    null
  );
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [charsCount, setCharsCount] = useState<number | undefined>();

  const [openNode, setOpenNode] = useState(false);
  const [openColor, setOpenColor] = useState(false);
  const [openLink, setOpenLink] = useState(false);
  const [openAI, setOpenAI] = useState(false);

  // Apply code block highlighting on the editor HTML
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

      await saveDocumentContent(documentId, json);

      window.localStorage.setItem(
        'html-content',
        highlightCodeblocks(editor.getHTML())
      );
      window.localStorage.setItem('novel-content', JSON.stringify(json));
      window.localStorage.setItem(
        'markdown',
        editor.storage.markdown.getMarkdown()
      );
      setSaveStatus('Saved');
    },
    500
  );

  useEffect(() => {
    const loadDocument = async () => {
      try {
        const fetchedContent = await fetchDocumentContent(documentId);

        setInitialContent(fetchedContent); // Directly set the fetched content
      } catch (error) {
        console.error('Failed to load document:', error);
      }
    };

    loadDocument();
  }, [documentId]);

  if (!initialContent) return null;

  return (
    <div className="relative w-full max-w-screen-lg">
      <div className="absolute right-5 top-5 z-10 mb-5 flex gap-2">
        <div className="bg-accent text-muted-foreground rounded-lg px-2 py-1 text-sm">
          {saveStatus}
        </div>
        <div
          className={
            charsCount
              ? 'bg-accent text-muted-foreground rounded-lg px-2 py-1 text-sm'
              : 'hidden'
          }
        >
          {charsCount} Words
        </div>
      </div>
      <EditorRoot>
        <EditorContent
          initialContent={initialContent}
          extensions={extensions}
          className="border-muted bg-background relative min-h-[500px] w-full max-w-screen-lg sm:mb-[calc(20vh)] sm:rounded-lg sm:border sm:shadow-lg"
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
          onUpdate={({ editor }) => {
            debouncedUpdates(editor);
            setSaveStatus('Unsaved');
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
            <Separator orientation="vertical" />
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

export default TailwindAdvancedEditor;
