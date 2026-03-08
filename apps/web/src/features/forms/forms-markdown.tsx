'use client';

import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid as mermaidPlugin } from '@streamdown/mermaid';
import { cn } from '@tuturuuu/utils/format';
import { Component, type ErrorInfo, type ReactNode, useMemo } from 'react';
import { Streamdown } from 'streamdown';

import { normalizeMarkdownToText } from './content';

const plugins = { code, mermaid: mermaidPlugin, math, cjk };

function normalizeMarkdownTables(text: string) {
  if (!text.includes('```')) {
    return text;
  }

  return text.replace(
    /```(?:markdown|md)\s*\n([\s\S]*?)```/gi,
    (_, body: string) => body.trim()
  );
}

class MarkdownErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Forms markdown render error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

const INLINE_ALLOWED_ELEMENTS = ['a', 'br', 'code', 'del', 'em', 'p', 'strong'];

export function FormsMarkdown({
  content,
  className,
  variant = 'block',
}: {
  content: string;
  className?: string;
  variant?: 'block' | 'inline';
}) {
  const normalizedContent = useMemo(
    () => normalizeMarkdownTables(content),
    [content]
  );
  const fallback = (
    <span
      className={cn(
        variant === 'inline'
          ? 'wrap-break-word text-inherit'
          : 'wrap-break-word whitespace-pre-wrap',
        className
      )}
    >
      {normalizeMarkdownToText(normalizedContent)}
    </span>
  );

  return (
    <MarkdownErrorBoundary fallback={fallback}>
      <div
        className={cn(
          variant === 'inline'
            ? 'wrap-break-word text-inherit [&_a]:underline [&_li]:m-0 [&_li]:inline [&_ol]:m-0 [&_ol]:inline [&_ol]:pl-0 [&_p]:m-0 [&_p]:inline [&_pre]:hidden [&_table]:hidden [&_ul]:m-0 [&_ul]:inline [&_ul]:pl-0'
            : '[&_code]:wrap-anywhere [&_pre]:whitespace-pre-wrap! [&_pre_code]:whitespace-pre-wrap! wrap-break-word text-foreground [&_a]:break-all [&_a]:underline [&_blockquote]:border-border/60 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_h1]:text-3xl [&_h1]:leading-tight [&_h2]:text-2xl [&_h2]:leading-tight [&_h3]:text-xl [&_img]:h-auto [&_img]:max-h-80 [&_img]:rounded-2xl [&_img]:border [&_img]:border-border/60 [&_img]:object-cover [&_li>p]:m-0 [&_ol]:space-y-1 [&_p]:leading-7 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-sm [&_td]:align-top [&_th]:text-left [&_ul]:space-y-1',
          className
        )}
      >
        <Streamdown
          mode="static"
          plugins={plugins}
          controls={false}
          linkSafety={{ enabled: false }}
          skipHtml
          allowedElements={
            variant === 'inline' ? INLINE_ALLOWED_ELEMENTS : undefined
          }
          unwrapDisallowed={variant === 'inline'}
        >
          {normalizedContent}
        </Streamdown>
      </div>
    </MarkdownErrorBoundary>
  );
}
