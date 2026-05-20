'use client';

import {
  Check,
  Copy,
  FileJson,
  FilePen,
  Maximize2,
  Minimize2,
  PanelRightClose,
  SquarePen,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type Props = {
  chatJson: string;
  chatMarkdown: string;
  fullscreen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onToggleFullscreen: () => void;
};

export function MindAiHeaderActions({
  chatJson,
  chatMarkdown,
  fullscreen,
  onClose,
  onNewChat,
  onToggleFullscreen,
}: Props) {
  const t = useTranslations('mind');
  const [copied, setCopied] = useState<'json' | 'markdown' | null>(null);

  const copyChat = async (kind: 'json' | 'markdown', value: string) => {
    if (!value.trim() || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t('ai.chatActions')}
            className="h-7 w-7"
            size="icon"
            type="button"
            variant="ghost"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            disabled={!chatMarkdown.trim()}
            onSelect={() => copyChat('markdown', chatMarkdown)}
          >
            <FilePen className="h-4 w-4" />
            {copied === 'markdown'
              ? t('ai.copiedChatMarkdown')
              : t('ai.copyChatMarkdown')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!chatJson.trim()}
            onSelect={() => copyChat('json', chatJson)}
          >
            <FileJson className="h-4 w-4" />
            {copied === 'json' ? t('ai.copiedChatJson') : t('ai.copyChatJson')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        aria-label={t('actions.newChat')}
        className="h-7 w-7"
        onClick={onNewChat}
        size="icon"
        type="button"
        variant="ghost"
      >
        <SquarePen className="h-4 w-4" />
      </Button>
      <Button
        aria-label={
          fullscreen ? t('actions.restoreAi') : t('actions.fullscreenAi')
        }
        className="h-7 w-7"
        onClick={onToggleFullscreen}
        size="icon"
        type="button"
        variant="ghost"
      >
        {fullscreen ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
      </Button>
      <Button
        aria-label={t('actions.closeAi')}
        className="h-7 w-7"
        onClick={onClose}
        size="icon"
        type="button"
        variant="ghost"
      >
        <PanelRightClose className="h-4 w-4" />
      </Button>
    </>
  );
}
