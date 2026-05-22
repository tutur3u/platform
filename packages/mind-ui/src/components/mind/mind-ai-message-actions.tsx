'use client';

import { Check, Copy, FileJson, MoreHorizontal } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type Props = {
  markdown: string;
  message: UIMessage;
};

export function MindAiMessageActions({ markdown, message }: Props) {
  const t = useTranslations('mind');
  const [copied, setCopied] = useState<'json' | 'markdown' | null>(null);

  const copyValue = async (kind: 'json' | 'markdown', value: string) => {
    if (!value || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t('ai.messageActions')}
          className="h-7 w-7 opacity-80 hover:opacity-100"
          size="icon"
          type="button"
          variant="ghost"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          disabled={!markdown.trim()}
          onSelect={() => copyValue('markdown', markdown)}
        >
          <Copy className="h-4 w-4" />
          {copied === 'markdown'
            ? t('ai.copiedMarkdown')
            : t('ai.copyMarkdown')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => copyValue('json', JSON.stringify(message, null, 2))}
        >
          <FileJson className="h-4 w-4" />
          {copied === 'json' ? t('ai.copiedJson') : t('ai.copyJson')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
