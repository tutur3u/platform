'use client';

import {
  AudioLines,
  Brain,
  Check,
  ChevronDown,
  Ellipsis,
  Eye,
  MessageSquarePlus,
  MessageSquareText,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function AssistantHeader({
  onNewConversation,
  onVisibility,
}: {
  onNewConversation: () => void;
  onVisibility?: () => void;
}) {
  const t = useTranslations('ai_chat');
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="flex min-w-0 items-center justify-between gap-2 pb-2">
      <div className="flex min-w-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-border/50 bg-background/60 px-2 text-xs backdrop-blur-sm"
              aria-label={t('workspace_context_personal')}
            >
              <Brain className="size-3 shrink-0" />
              <span>{t('workspace_context_personal')}</span>
              <ChevronDown className="size-3 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem className="gap-2" disabled>
              <Brain className="size-3.5" />
              {t('workspace_context_personal')}
              <Check className="ml-auto size-3.5" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ToggleGroup
          aria-label={t('chat_mode')}
          className="h-8 shrink-0 gap-0.5 rounded-[10px] bg-muted/55 p-0.5 shadow-foreground/5 shadow-inner"
          type="single"
          value="chat"
        >
          <ToggleGroupItem
            aria-label={t('chat_mode')}
            className="h-7 gap-1.5 rounded-lg px-2.5 text-muted-foreground text-xs transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-1 data-[state=on]:bg-background/90 data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            value="chat"
          >
            <MessageSquareText className="size-3.5" />
            <span>{t('chat_mode')}</span>
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label={t('live_mode')}
            className="h-7 gap-1.5 rounded-lg px-2.5 text-muted-foreground text-xs transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-1 data-[state=on]:bg-background/90 data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            disabled
            value="live"
          >
            <AudioLines className="size-3.5" />
            <span>{t('live_mode')}</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onNewConversation}
              aria-label={t('new_chat')}
            >
              <MessageSquarePlus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('new_chat')}</TooltipContent>
        </Tooltip>

        <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2"
              aria-label={t('more_actions')}
            >
              <Ellipsis className="size-4" />
              <span className="hidden text-xs sm:inline">
                {t('more_actions')}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {onVisibility ? (
              <DropdownMenuItem
                onSelect={() => {
                  onVisibility();
                  setMoreOpen(false);
                }}
              >
                <Eye className="size-4" />
                {t('chat_visibility')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={() => {
                onNewConversation();
                setMoreOpen(false);
              }}
            >
              <MessageSquarePlus className="size-4" />
              {t('new_chat')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
