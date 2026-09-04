'use client';

import { Check, ChevronDown, Coins, Sparkles, Zap } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';

export function AssistantToolbar({ model }: { model?: AIModelUI }) {
  const t = useTranslations('ai_chat');

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 min-w-0 max-w-full gap-1.5 rounded-full px-2.5 text-muted-foreground text-xs hover:bg-muted/70 hover:text-foreground"
            aria-label={t('model')}
          >
            <Sparkles className="size-4 shrink-0" />
            <span>{t('model')}</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem className="gap-2" disabled>
            <Sparkles className="size-4" />
            <span className="min-w-0 flex-1 truncate">
              {model?.label ?? t('default_chat')}
            </span>
            <Check className="size-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="h-4 w-px bg-border/50" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-muted-foreground text-xs"
          >
            <Zap className="size-3.5" />
            {t('thinking_mode_fast')}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('thinking_mode_fast')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-muted-foreground text-xs"
            disabled
          >
            <Coins className="size-3.5" />
            {t('credit_source_personal')}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('credit_source_personal')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
