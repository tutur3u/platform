'use client';

import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import { isHttpsUrl } from './link-groups';

const BODY_CLASS =
  'text-sm leading-relaxed break-words [&_a]:text-dynamic-blue [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:ml-5 [&_ul]:list-disc';

/** Renders a comment as markdown, with the same renderer as task descriptions. */
export function CommentBody({ body }: { body: string }) {
  return (
    <div className={BODY_CLASS}>
      <MemoizedReactMarkdown
        components={{
          a: ({ href, children }) =>
            isHttpsUrl(href) ? (
              <a href={href} rel="noopener noreferrer" target="_blank">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {body}
      </MemoizedReactMarkdown>
    </div>
  );
}
