import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid as mermaidPlugin } from '@streamdown/mermaid';
import { Brain, ChevronRight, Loader2 } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useMemo,
  useState,
} from 'react';
import { Streamdown } from 'streamdown';

const plugins = { code, mermaid: mermaidPlugin, math, cjk };

function isMarkdownTableBlock(content: string): boolean {
  const lines = content
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return false;
  const header = lines[0] ?? '';
  const separator = lines[1] ?? '';

  const hasPipeInHeader = header.includes('|');
  const isSeparatorRow = /^\|?[\s:-|]+\|?$/.test(separator);
  const hasDashInSeparator = separator.includes('-');

  return hasPipeInHeader && isSeparatorRow && hasDashInSeparator;
}

function normalizeMarkdownTables(text: string): string {
  if (!text.includes('```')) return text;

  return text.replace(
    /```(?:markdown|md)\s*\n([\s\S]*?)```/gi,
    (fullMatch, body: string) => {
      if (!isMarkdownTableBlock(body)) return fullMatch;
      return body.trim();
    }
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

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Streamdown render error:', error, info);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export function AssistantMarkdown({
  text,
  isAnimating,
}: {
  text: string;
  isAnimating: boolean;
}) {
  const normalizedText = useMemo(() => normalizeMarkdownTables(text), [text]);

  return (
    <div className="wrap-break-word [&_pre]:overflow-x-hidden! [&_pre]:whitespace-pre-wrap! [&_pre]:wrap-break-word [&_pre_code]:whitespace-pre-wrap! [&_pre_code]:wrap-anywhere min-w-0 max-w-full overflow-hidden [&_pre]:max-w-full">
      <MarkdownErrorBoundary
        fallback={
          <p className="wrap-break-word whitespace-pre-wrap">
            {normalizedText}
          </p>
        }
      >
        <Streamdown
          plugins={plugins}
          caret="block"
          isAnimating={isAnimating}
          controls={{
            code: !isAnimating,
            mermaid: !isAnimating,
          }}
          linkSafety={{ enabled: false }}
        >
          {normalizedText}
        </Streamdown>
      </MarkdownErrorBoundary>
    </div>
  );
}

function getLatestReasoningHeader(text: string): string | null {
  if (!text) return null;
  const headers = [...text.matchAll(/^#+\s+(.+)$/gm)];
  if (headers.length > 0) {
    const last = headers[headers.length - 1];
    if (last?.[1]) return last[1].trim();
  }
  const bolds = [...text.matchAll(/^\*\*([^*]+)\*\*$/gm)];
  if (bolds.length > 0) {
    const last = bolds[bolds.length - 1];
    if (last?.[1]) return last[1].trim();
  }
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (!block) continue;
    const blockLines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const firstLine = blockLines[0];
    if (
      blockLines.length === 1 &&
      firstLine &&
      firstLine.length < 65 &&
      !/[.!?:]$/.test(firstLine)
    ) {
      return firstLine;
    }
  }
  return null;
}

export function ReasoningPart({
  text,
  isAnimating,
}: {
  text: string;
  isAnimating: boolean;
}) {
  const t = useTranslations('dashboard.mira_chat');
  const [expanded, setExpanded] = useState(false);
  const latestHeader = useMemo(() => getLatestReasoningHeader(text), [text]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
      >
        {isAnimating ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Brain className="h-3 w-3" />
        )}
        <span className="font-medium">
          {isAnimating ? t('reasoning') : t('reasoned')}
        </span>
        {latestHeader && (
          <>
            <span className="text-muted-foreground/40">•</span>
            <span className="max-w-50 truncate text-muted-foreground/80 sm:max-w-75">
              {latestHeader}
            </span>
          </>
        )}
        <ChevronRight
          className={cn(
            'ml-1 h-3 w-3 transition-transform',
            expanded && 'rotate-90'
          )}
        />
      </button>
      {expanded && (
        <div className="[&_pre]:overflow-x-hidden! [&_pre]:whitespace-pre-wrap! [&_pre_code]:whitespace-pre-wrap! [&_pre]:wrap-break-word [&_pre_code]:wrap-anywhere border-dynamic-purple/20 border-l-2 pl-3 text-muted-foreground text-xs [&_pre]:max-w-full">
          <MarkdownErrorBoundary
            fallback={<p className="whitespace-pre-wrap">{text}</p>}
          >
            <Streamdown
              plugins={plugins}
              caret="block"
              isAnimating={isAnimating}
              controls={{
                code: !isAnimating,
                mermaid: false,
              }}
              linkSafety={{ enabled: false }}
            >
              {text}
            </Streamdown>
          </MarkdownErrorBoundary>
        </div>
      )}
    </div>
  );
}
