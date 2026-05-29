'use client';

import {
  Brain,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { AssistantMarkdown } from './ai-message-markdown';
import {
  type AiMessagePart,
  getPartKey,
  normalizeAiMessageParts,
  readString,
} from './ai-message-render-utils';
import {
  type AiPartLabels,
  isAiToolPart,
  ToolGroup,
} from './ai-message-tool-part';

export type { AiMessagePart } from './ai-message-render-utils';

export function AiMessageParts({
  className,
  isStreaming,
  parts,
  textFallback,
}: {
  className?: string;
  isStreaming?: boolean;
  parts?: AiMessagePart[];
  textFallback?: string;
}) {
  const t = useTranslations('chat');
  const normalizedParts = useMemo(
    () => normalizeAiMessageParts(parts, textFallback),
    [parts, textFallback]
  );
  const labels = {
    completed: t('ai_tool_completed'),
    downloadQrCode: t('download_qr_code'),
    failed: t('ai_tool_failed'),
    generatedQrCode: t('generated_qr_code'),
    input: t('ai_tool_input'),
    output: t('ai_tool_output'),
    running: t('ai_tool_running'),
    thinking: t('ai_thinking_mode'),
    thought: t('ai_thought'),
  };
  const contentParts = normalizedParts.filter((part) => !isAiToolPart(part));
  const toolParts = normalizedParts.filter(isAiToolPart);

  if (normalizedParts.length === 0) return null;

  return (
    <div className={cn('flex min-w-0 max-w-full flex-col gap-2', className)}>
      {contentParts.map((part, index) => (
        <AiPartRenderer
          isStreaming={Boolean(isStreaming)}
          key={getPartKey(part, index)}
          labels={labels}
          part={part}
        />
      ))}
      {toolParts.length > 0 && (
        <ToolGroup
          isStreaming={Boolean(isStreaming)}
          labels={labels}
          parts={toolParts}
        />
      )}
    </div>
  );
}

function AiPartRenderer({
  isStreaming,
  labels,
  part,
}: {
  isStreaming: boolean;
  labels: AiPartLabels;
  part: AiMessagePart;
}) {
  const type = readString(part.type);

  if (type === 'text') {
    return (
      <AssistantMarkdown
        isAnimating={isStreaming}
        text={readString(part.text) ?? ''}
      />
    );
  }

  if (type === 'reasoning') {
    return (
      <ReasoningBlock
        isAnimating={isStreaming}
        labels={labels}
        text={readString(part.text) ?? ''}
      />
    );
  }

  if (type === 'source-url') {
    return <SourceUrlPart part={part} />;
  }

  return null;
}

function ReasoningBlock({
  isAnimating,
  labels,
  text,
}: {
  isAnimating?: boolean;
  labels: AiPartLabels;
  text: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!text.trim()) return null;

  return (
    <div className="rounded-md border border-dynamic-purple/20 bg-dynamic-purple/5 p-2">
      <button
        className="flex w-full items-center gap-2 text-dynamic-purple text-xs"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {isAnimating ? (
          <LoaderCircle className="size-3 animate-spin" />
        ) : (
          <Brain className="size-3" />
        )}
        <span className="font-medium">
          {isAnimating ? labels.thinking : labels.thought}
        </span>
        <ChevronRight
          className={cn(
            'ml-auto size-3 transition-transform',
            expanded && 'rotate-90'
          )}
        />
      </button>
      {expanded && (
        <div className="mt-2 border-dynamic-purple/20 border-l pl-3 text-muted-foreground text-xs">
          <AssistantMarkdown isAnimating={isAnimating} text={text} />
        </div>
      )}
    </div>
  );
}

function SourceUrlPart({ part }: { part: AiMessagePart }) {
  const url = readString(part.url);
  if (!url) return null;

  return (
    <a
      className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/25 px-2 py-1.5 text-xs hover:bg-accent"
      href={url}
      rel="noreferrer noopener"
      target="_blank"
    >
      <ExternalLink className="size-3.5 shrink-0" />
      <span className="truncate">{readString(part.title) ?? url}</span>
    </a>
  );
}
