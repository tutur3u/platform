'use client';
import { CodeXml, FileText, LayoutGrid } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { MeetToolDefinition } from '../tools/registry';
import { ActivitiesDialog } from './activities-dialog';
import type { ActivityTile } from './activities-pages';
import type { ActivityEntry } from './call-activities';
import { controlPillClass } from './control-button';

export type { ActivityTile } from './activities-pages';

/** A dialog page listed with the activities, such as the room timer. */
export type ActivityPage = Omit<ActivityTile, 'open' | 'page'> & {
  page: NonNullable<ActivityTile['page']>;
};

/**
 * The labeled Activities entry in the root bar. It opens the Activities
 * dialog: Co-Programming and the live document, every registered tool, the
 * room's extra entries and dialog pages, grouped like Settings. Showcase
 * viewers see the same list as a preview with a feedback shortcut instead of
 * launch actions.
 */
export function ActivitiesMenu({
  tools,
  activeToolId,
  onTool,
  collaboration,
  extra = [],
  pages = [],
  preview,
}: {
  tools: readonly MeetToolDefinition[];
  activeToolId: string | null;
  onTool: (id: string) => void;
  /** Classroom tools and in-call forms, when the room has them. */
  extra?: readonly ActivityEntry[];
  /** Pages that render inside the dialog, such as Timer and Room activities. */
  pages?: readonly ActivityPage[];
  collaboration?: {
    programming: { active: boolean; toggle: () => void };
    document: { active: boolean; toggle: () => void };
  };
  preview?: { onFeedback: () => void };
}) {
  const t = useTranslations('meet.call.activities');
  const programmingT = useTranslations('programmingPlayground');
  const collaborationT = useTranslations('meet.collaboration');
  const all = useTranslations();
  const [open, setOpen] = useState(false);
  const toolLabel = (tool: MeetToolDefinition) =>
    all.has(tool.label) ? all(tool.label) : tool.label;
  const describe = (id: string) =>
    t.has(`descriptions.${id}`) ? t(`descriptions.${id}`) : undefined;
  const entries: ActivityTile[] = [
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
    ...pages,
  ];
  const tiles = entries.map((tile) => ({
    ...tile,
    description: tile.description ?? describe(tile.id),
  }));
  if (!tiles.length) return null;
  const live = tiles.filter((tile) => tile.active).length;
  const label = live ? t('button_live', { count: live }) : t('button');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              aria-label={label}
              className={cn(
                controlPillClass,
                'w-11 px-0 md:w-auto md:px-4',
                live
                  ? 'border-transparent bg-foreground/15'
                  : 'border-transparent bg-accent'
              )}
              type="button"
              variant="ghost"
            >
              <LayoutGrid className="size-5" />
              <span className="hidden md:inline">{t('button')}</span>
              {live > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-dynamic-green px-1 font-medium text-[0.6rem] text-white md:static md:min-w-0 md:bg-dynamic-green/15 md:px-2 md:py-0.5 md:text-dynamic-green md:text-xs"
                >
                  <span className="md:hidden">{live}</span>
                  <span className="hidden md:inline">
                    {t('live_count', { count: live })}
                  </span>
                </span>
              )}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <ActivitiesDialog
        tiles={tiles}
        onClose={() => setOpen(false)}
        onFeedback={
          preview
            ? () => {
                preview.onFeedback();
                setOpen(false);
              }
            : undefined
        }
      />
    </Dialog>
  );
}
