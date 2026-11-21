'use client';

import { LayoutGrid } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  ControlButton,
  ControlMenuScope,
  controlButtonClass,
} from '../components/control-bar';
import type { MeetToolDefinition } from './registry';

function useToolLabel() {
  const t = useTranslations();
  return (tool: MeetToolDefinition) =>
    t.has(tool.label) ? t(tool.label) : tool.label;
}

/** Tool rows for an open menu (the hub popover or the phone overflow menu). */
export function MeetToolsMenu({
  tools,
  activeId,
  onSelect,
}: {
  tools: readonly MeetToolDefinition[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const label = useToolLabel();
  return tools.map((tool) => (
    <ControlButton
      key={tool.id}
      active={activeId === tool.id}
      icon={tool.icon}
      label={label(tool)}
      onClick={() => onSelect(tool.id)}
    />
  ));
}

/** The control-bar entry that opens polls, timers and quizzes from one place. */
export function MeetToolsHub({
  tools,
  activeId,
  onSelect,
}: {
  tools: readonly MeetToolDefinition[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('meet.call.tools');
  const [open, setOpen] = useState(false);
  if (!tools.length) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={t('open')}
              aria-pressed={!!activeId}
              className={cn(
                controlButtonClass,
                activeId && 'border-transparent bg-foreground/15'
              )}
              size="icon"
              type="button"
              variant="ghost"
            >
              <LayoutGrid className="size-5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('title')}</TooltipContent>
      </Tooltip>
      <PopoverContent
        aria-label={t('title')}
        className="flex max-h-[min(28rem,70dvh)] w-64 max-w-[calc(100vw-1rem)] flex-col gap-1 overflow-y-auto p-2"
        side="top"
        sideOffset={8}
      >
        <p className="px-3 pt-1 pb-1.5 font-medium text-muted-foreground text-xs">
          {t('title')}
        </p>
        <ControlMenuScope onClose={() => setOpen(false)}>
          <MeetToolsMenu
            tools={tools}
            activeId={activeId}
            onSelect={onSelect}
          />
        </ControlMenuScope>
      </PopoverContent>
    </Popover>
  );
}
