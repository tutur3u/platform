'use client';

import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { normalizeMarkdownToText } from '../content';
import { FormsMarkdown } from '../forms-markdown';

export function ExpandableDescriptionPanel({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const t = useTranslations('forms');
  const [expanded, setExpanded] = useState(false);
  const plainText = normalizeMarkdownToText(content);
  const shouldCollapse =
    plainText.length > 180 || plainText.split(/\s+/).length > 30;

  if (!plainText) {
    return null;
  }

  return (
    <div className="space-y-3">
      {expanded || !shouldCollapse ? (
        <FormsMarkdown
          content={content}
          className={cn('text-base text-muted-foreground', className)}
        />
      ) : (
        <p
          className={cn(
            'line-clamp-3 whitespace-pre-wrap text-base text-muted-foreground leading-7',
            className
          )}
        >
          {plainText}
        </p>
      )}
      {shouldCollapse ? (
        <div className="pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-4 font-medium text-muted-foreground text-xs transition-all hover:bg-foreground/5 hover:text-foreground"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded
              ? t('runtime.show_less_description')
              : t('runtime.show_more_description')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
