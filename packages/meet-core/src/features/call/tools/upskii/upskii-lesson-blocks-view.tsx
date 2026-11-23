'use client';

import type { UpskiiLessonBlock } from './upskii-lesson-blocks';

/** Sanitized lesson blocks at a size a projected room and a phone can read. */
export function UpskiiLessonBlocksView({
  blocks,
}: {
  blocks: readonly UpskiiLessonBlock[];
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 text-left text-base leading-relaxed @lg:text-lg">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case 'heading':
            return block.level === 2 ? (
              <h3 key={key} className="font-semibold text-xl @lg:text-2xl">
                {block.text}
              </h3>
            ) : (
              <h4 key={key} className="font-semibold text-lg @lg:text-xl">
                {block.text}
              </h4>
            );
          case 'paragraph':
            return <p key={key}>{block.text}</p>;
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List
                key={key}
                className={`flex flex-col gap-1 pl-6 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{item}</li>
                ))}
              </List>
            );
          }
          case 'image':
            return (
              <img
                key={key}
                src={block.src}
                alt={block.alt}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="max-h-96 w-full rounded-xl object-contain"
              />
            );
          default: {
            const unreachable: never = block;
            return unreachable;
          }
        }
      })}
    </div>
  );
}
