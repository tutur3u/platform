import { cn } from '@tuturuuu/utils/format';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  type RepositoryMarkdownContext,
  resolveRepositoryMarkdownImage,
  resolveRepositoryMarkdownLink,
} from '../../lib/github/markdown';

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
        'prose prose-neutral dark:prose-invert min-w-0 max-w-none overflow-hidden',
        'prose-img:h-auto prose-img:max-w-full prose-pre:overflow-x-auto prose-a:break-words',
        className
      )}
    >
      <ReactMarkdown
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
          table: ({ children, node: _node, ...props }) => (
            <div className="my-4 max-w-full overflow-x-auto">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
        remarkPlugins={[remarkGfm]}
        skipHtml
      >
        {children}
      </ReactMarkdown>
    </article>
  );
}
