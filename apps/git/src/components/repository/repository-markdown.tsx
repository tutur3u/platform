'use client';

import { code } from '@streamdown/code';
import { cn } from '@tuturuuu/utils/format';
import { type PluginConfig, Streamdown } from 'streamdown';
import {
  type RepositoryMarkdownContext,
  resolveRepositoryMarkdownImage,
  resolveRepositoryMarkdownLink,
} from '../../lib/github/markdown';

const plugins = { code: code as unknown as PluginConfig['code'] };

type Props = {
  children?: string;
  className?: string;
  context?: RepositoryMarkdownContext;
};

export function RepositoryMarkdown({
  children = '',
  className,
  context,
}: Props) {
  return (
    <article
      className={cn(
        'repository-markdown min-w-0 max-w-none overflow-hidden text-[15px] leading-7 [contain-intrinsic-size:auto_900px] [content-visibility:auto]',
        '[&_a]:break-words [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4',
        '[&_blockquote]:border-border [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
        '[&_h1]:mt-0 [&_h1]:border-b [&_h1]:pb-3 [&_h1]:font-semibold [&_h1]:text-3xl',
        '[&_h2]:mt-8 [&_h2]:border-b [&_h2]:pb-2 [&_h2]:font-semibold [&_h2]:text-2xl',
        '[&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-xl',
        '[&_hr]:my-8 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_img]:border',
        '[&_li]:my-1 [&_ol]:my-4 [&_ol]:pl-6 [&_p]:my-4 [&_ul]:my-4 [&_ul]:pl-6',
        '[&_.shiki]:bg-transparent! [&_[data-streamdown=code-block]]:border [&_[data-streamdown=code-block]]:bg-muted/25! [&_pre]:overflow-x-auto',
        '[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-sm',
        className
      )}
    >
      <Streamdown
        components={{
          a: ({ href = '', node: _node, ...props }) => (
            <a {...props} href={resolveRepositoryMarkdownLink(href, context)} />
          ),
          img: ({ alt = '', node: _node, src = '', ...props }) => {
            const resolvedSource =
              typeof src === 'string'
                ? resolveRepositoryMarkdownImage(src, context)
                : undefined;

            return (
              // Repository Markdown can reference arbitrary aspect ratios, so
              // a native lazy image is more appropriate than next/image here.
              // biome-ignore lint/performance/noImgElement: repository content has no trusted dimensions
              <img
                {...props}
                alt={alt}
                decoding="async"
                loading="lazy"
                src={resolvedSource}
              />
            );
          },
        }}
        controls={{ code: true, table: true }}
        linkSafety={{ enabled: false }}
        mode="static"
        plugins={plugins}
        skipHtml
      >
        {children}
      </Streamdown>
    </article>
  );
}
