'use client';
import { CodeXml, FileText, LayoutGrid, MessageSquare } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ComponentType, useState } from 'react';
import type { MeetToolDefinition } from '../tools/registry';
import type { ActivityEntry } from './call-activities';
import { controlPillClass } from './control-bar';

type Tile = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  open?: () => void;
};

/**
 * The labeled Activities entry in the root bar. Co-Programming and the live
 * document come first, then every registered tool. Showcase viewers see the
 * same grid as a preview with a feedback shortcut instead of launch actions.
 */
export function ActivitiesMenu({
  tools,
  activeToolId,
  onTool,
  collaboration,
  extra = [],
  preview,
}: {
  tools: readonly MeetToolDefinition[];
  activeToolId: string | null;
  onTool: (id: string) => void;
  /** Classroom tools and in-call forms, when the room has them. */
  extra?: readonly ActivityEntry[];
  collaboration?: {
    programming: { active: boolean; toggle: () => void };
    document: { active: boolean; toggle: () => void };
  };
  preview?: { onFeedback: () => void };
}) {
  const t = useTranslations('meet.call.activities');
  const roomT = useTranslations('meet.call.room_tools');
  const programmingT = useTranslations('programmingPlayground');
  const collaborationT = useTranslations('meet.collaboration');
  const all = useTranslations();
  const [open, setOpen] = useState(false);
  const toolLabel = (tool: MeetToolDefinition) =>
    all.has(tool.label) ? all(tool.label) : tool.label;
  const describe = (id: string) =>
    t.has(`descriptions.${id}`) ? t(`descriptions.${id}`) : undefined;
  const tiles: Tile[] = [
    ...(collaboration || preview
      ? [
          {
            id: 'programming',
            label: programmingT('coding'),
            icon: CodeXml,
            active: !!collaboration?.programming.active,
            open: collaboration?.programming.toggle,
          },
          {
            id: 'document',
            label: collaborationT('document'),
            icon: FileText,
            active: !!collaboration?.document.active,
            open: collaboration?.document.toggle,
          },
        ]
      : []),
    ...tools.map((tool) => ({
      id: tool.id,
      label: toolLabel(tool),
      icon: tool.icon,
      active: activeToolId === tool.id,
      open: preview ? undefined : () => onTool(tool.id),
    })),
    ...extra.map((entry) => ({
      id: entry.id,
      label: entry.label,
      icon: entry.icon,
      active: entry.active,
      // Classroom tools and forms keep their own access rules, so a showcase
      // preview never locks them.
      open: entry.toggle,
    })),
  ];
  if (!tiles.length) return null;
  const anyActive = tiles.some((tile) => tile.active);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={t('button')}
              className={cn(
                controlPillClass,
                'w-11 px-0 md:w-auto md:px-4',
                anyActive
                  ? 'border-transparent bg-foreground/15'
                  : 'border-transparent bg-accent'
              )}
              type="button"
              variant="ghost"
            >
              <LayoutGrid className="size-5" />
              <span className="hidden md:inline">{t('button')}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('button')}</TooltipContent>
      </Tooltip>
      <PopoverContent
        aria-label={t('title')}
        className="max-h-[min(34rem,75dvh)] w-[min(34rem,calc(100vw-1rem))] overflow-y-auto rounded-2xl p-3"
        side="top"
        sideOffset={8}
      >
        <div className="flex items-center justify-between gap-3 px-1 pb-3">
          <p className="font-semibold text-base">{t('title')}</p>
          {preview ? (
            <Badge variant="outline">{roomT('preview')}</Badge>
          ) : (
            <p className="text-muted-foreground text-xs">{t('hint')}</p>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            const description = describe(tile.id);
            const body = (
              <>
                <span className="grid size-9 place-items-center rounded-lg bg-muted">
                  <Icon className="size-5" />
                </span>
                <span className="font-semibold text-sm">{tile.label}</span>
                {description && (
                  <span className="text-muted-foreground text-xs leading-snug">
                    {description}
                  </span>
                )}
              </>
            );
            const tileClass =
              'flex h-full min-h-24 w-full flex-col items-start gap-1.5 rounded-xl border bg-card p-3 text-left';
            return (
              <li key={tile.id}>
                {tile.open ? (
                  <button
                    type="button"
                    aria-pressed={tile.active}
                    className={cn(
                      tileClass,
                      'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                      tile.active && 'border-foreground bg-accent'
                    )}
                    onClick={() => {
                      tile.open?.();
                      setOpen(false);
                    }}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={cn(tileClass, 'opacity-80')}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        {preview && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t px-1 pt-3">
            <p className="min-w-0 flex-1 text-muted-foreground text-xs">
              {roomT('preview_hint')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => {
                preview.onFeedback();
                setOpen(false);
              }}
            >
              <MessageSquare className="size-4" />
              {roomT('feedback')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
