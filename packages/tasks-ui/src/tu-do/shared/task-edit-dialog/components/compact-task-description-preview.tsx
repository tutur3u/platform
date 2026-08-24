'use client';

import type { JSONContent } from '@tiptap/react';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import { TaskRichTextEditor } from '../../../../text-editor/task-rich-text-editor';

function getPlainTextDocument(content: JSONContent | null): string | null {
  if (content?.type !== 'doc' || !content.content?.length) {
    return null;
  }

  const paragraphs = content.content.map((node) => {
    if (node.type !== 'paragraph') return null;
    if (!node.content?.length) return '';

    const textParts = node.content.map((child) => {
      if (child.type !== 'text' || child.marks?.length) return null;
      return child.text ?? '';
    });
    return textParts.some((part) => part === null) ? null : textParts.join('');
  });

  return paragraphs.some((paragraph) => paragraph === null)
    ? null
    : paragraphs.join('\n\n');
}

export function CompactTaskDescriptionPreview({
  content,
}: {
  content: JSONContent | null;
}) {
  const markdown = getPlainTextDocument(content);

  if (markdown !== null) {
    return (
      <div className="max-h-[4.5rem] overflow-hidden text-muted-foreground text-sm leading-relaxed [&_h1]:mb-1 [&_h1]:font-semibold [&_h1]:text-foreground [&_h1]:text-sm [&_h2]:mb-1 [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:text-sm [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-0 [&_ul]:ml-5 [&_ul]:list-disc">
        <MemoizedReactMarkdown>{markdown}</MemoizedReactMarkdown>
      </div>
    );
  }

  return (
    <div className="pointer-events-none max-h-[4.5rem] overflow-hidden text-sm">
      <TaskRichTextEditor
        content={content}
        readOnly
        className="border-0 p-0! text-sm [&_h1]:my-0 [&_h1]:text-base [&_h2]:my-0 [&_h2]:text-base [&_h3]:my-0 [&_h3]:text-sm [&_li]:my-0 [&_li]:leading-relaxed [&_p]:my-0 [&_p]:leading-relaxed"
      />
    </div>
  );
}
