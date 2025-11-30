'use client';

import type { JSONContent } from '@tiptap/react';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';

interface ChangelogContentRendererProps {
  content: JSONContent;
}

export function ChangelogContentRenderer({
  content,
}: ChangelogContentRendererProps) {
  return (
    <RichTextEditor
      content={content}
      readOnly
      className="border-none bg-transparent p-0"
    />
  );
}
