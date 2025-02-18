'use client';

import { TableOfContentsStorage } from '@tiptap-pro/extension-table-of-contents';
import { Editor as CoreEditor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { cn } from '@tutur3u/utils/format';
import { memo } from 'react';

export type TableOfContentsProps = {
  editor: CoreEditor;
  onItemClick?: () => void;
};

export const TableOfContents = memo(
  ({ editor, onItemClick }: TableOfContentsProps) => {
    const content = useEditorState({
      editor,
      selector: (ctx) =>
        (ctx.editor.storage.tableOfContents as TableOfContentsStorage).content,
    });

    return (
      <>
        <div className="mb-2 text-xs font-semibold text-neutral-500 uppercase dark:text-neutral-400">
          Table of contents
        </div>
        {content.length > 0 ? (
          <div className="flex flex-col gap-1">
            {content.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                style={{ marginLeft: `${1 * item.level - 1}rem` }}
                onClick={onItemClick}
                className={cn(
                  'block w-full truncate rounded p-1 text-sm font-medium text-neutral-500 transition-all hover:bg-black hover:text-neutral-800 dark:text-neutral-300',
                  item.isActive &&
                    'bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-100'
                )}
              >
                {item.itemIndex}. {item.textContent}
              </a>
            ))}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">
            Start adding headlines to your document …
          </div>
        )}
      </>
    );
  }
);

TableOfContents.displayName = 'TableOfContents';
