'use client';

import type { JSONContent } from '@tuturuuu/types/tiptap';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';

type ChangelogContentRendererProps = {
  content: JSONContent;
};

export function ChangelogContentRenderer({
  content,
}: ChangelogContentRendererProps) {
  return (
    <RichTextEditor
      className="border-none bg-transparent p-0"
      content={content}
      readOnly
    />
  );
}
