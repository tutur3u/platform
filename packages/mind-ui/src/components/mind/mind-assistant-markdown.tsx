'use client';

import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { mermaid as mermaidPlugin } from '@streamdown/mermaid';
import { cn } from '@tuturuuu/utils/format';
import 'katex/dist/katex.min.css';
import { Component, type ErrorInfo, type ReactNode, useMemo } from 'react';
import { Streamdown } from 'streamdown';

const math = createMathPlugin({
  singleDollarTextMath: true,
});
const plugins = { cjk, code, math, mermaid: mermaidPlugin };

function isMarkdownTableSeparator(separator: string) {
  for (const char of separator) {
    if (char !== '|' && char !== '-' && char !== ':' && !/\s/.test(char)) {
      return false;
    }
  }

  return true;
}

function isMarkdownTableBlock(content: string) {
  const lines = content
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return false;
  const header = lines[0] ?? '';
  const separator = lines[1] ?? '';

  return (
    header.includes('|') &&
    isMarkdownTableSeparator(separator) &&
    separator.includes('-')
  );
}

function normalizeMarkdownTables(text: string) {
  if (!text.includes('```')) return text;

  return text.replace(
    /```(?:markdown|md)\s*\n([\s\S]*?)```/gi,
    (fullMatch, body: string) =>
      isMarkdownTableBlock(body) ? body.trim() : fullMatch
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

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.setState({ hasError: true });
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function MindAssistantMarkdown({
  className,
  isAnimating,
  text,
}: {
  className?: string;
  isAnimating: boolean;
  text: string;
}) {
  const normalizedText = useMemo(() => normalizeMarkdownTables(text), [text]);

  return (
    <div
      className={cn(
        'wrap-break-word min-w-0 max-w-full overflow-hidden text-sm leading-6',
        '[&_pre]:overflow-x-hidden! [&_pre]:whitespace-pre-wrap! [&_pre_code]:whitespace-pre-wrap! [&_a]:break-all [&_li]:my-0.5 [&_ol]:my-1.5 [&_p]:my-1 [&_pre]:max-w-full [&_ul]:my-1.5',
        className
      )}
    >
      <MarkdownErrorBoundary
        fallback={<p className="whitespace-pre-wrap">{normalizedText}</p>}
      >
        <Streamdown
          caret="block"
          controls={{
            code: !isAnimating,
            mermaid: !isAnimating,
          }}
          isAnimating={isAnimating}
          linkSafety={{ enabled: false }}
          plugins={plugins}
        >
          {normalizedText}
        </Streamdown>
      </MarkdownErrorBoundary>
    </div>
  );
}
