'use client';

import { Brain, ChevronDown, LoaderCircle } from '@tuturuuu/icons';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { MindAssistantMarkdown } from './mind-assistant-markdown';

export function MindAiReasoning({
  isStreaming,
  text,
}: {
  isStreaming: boolean;
  text: string;
}) {
  const t = useTranslations('mind');
  const [open, setOpen] = useState(isStreaming);

  useEffect(() => {
    setOpen(isStreaming);
  }, [isStreaming]);

  if (!text.trim()) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border bg-background/70 px-2 py-1.5 text-left text-muted-foreground text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          {isStreaming ? (
            <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-dynamic-blue" />
          ) : (
            <Brain className="h-3.5 w-3.5 shrink-0 text-dynamic-blue" />
          )}
          <span className="truncate">
            {isStreaming ? t('ai.reasoningStreaming') : t('ai.reasoning')}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition',
            open && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 rounded-md border border-border/70 bg-background/50 px-3 py-2 text-muted-foreground">
        <MindAssistantMarkdown isAnimating={isStreaming} text={text} />
      </CollapsibleContent>
    </Collapsible>
  );
}
