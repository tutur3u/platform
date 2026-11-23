'use client';
import { CodeXml, FileText, LayoutGrid, Presentation } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useState } from 'react';
import type { MeetToolDefinition } from '../tools/registry';
import { useActivitiesRequest } from '../stage-layout/activities-request';
import { ActivitiesDialog } from './activities-dialog';
import {
  ActivitiesNavigationContext,
  type ActivityTile,
} from './activities-pages';
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
  openToolIds,
  onTool,
  collaboration,
  extra = [],
  pages = [],
  preview,
  navigationAllowed = false,
}: {
  tools: readonly MeetToolDefinition[];
  /** Ids of the tools open on the stage. */
  openToolIds: readonly string[];
  onTool: (id: string) => void;
  /** Classroom tools and in-call forms, when the room has them. */
  extra?: readonly ActivityEntry[];
  /** Pages that render inside the dialog, such as Timer and Room activities. */
  pages?: readonly ActivityPage[];
  collaboration?: {
    programming: { active: boolean; toggle: () => void };
    document: { active: boolean; toggle: () => void };
    board?: { active: boolean; toggle: () => void };
  };
  preview?: { onFeedback: () => void };
  /** Whether this person may Follow and Summon (`nav.allowed`). */
  navigationAllowed?: boolean;
}) {
  const t = useTranslations('meet.call.activities');
  const programmingT = useTranslations('programmingPlayground');
  const collaborationT = useTranslations('meet.collaboration');
  const all = useTranslations();
  const [open, setOpen] = useState(false);
  // The stage can ask for the dialog (its phone switcher lists "Open another
  // activity"); a new request opens it.
  const request = useActivitiesRequest();
  const [handled, setHandled] = useState(request?.count ?? 0);
  const [persistedTab, setPersistedTab] = useQueryState(
    'activitiesTab',
    parseAsString.withOptions({
      history: 'replace',
      shallow: true,
      scroll: false,
    })
  );
  // Closing clears the tab, so the dock and presence-roster entries each
  // open on the overview instead of the other's last page.
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) void setPersistedTab(null);
  };
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
          ...(collaboration?.board
            ? [
                {
                  id: 'board',
                  label: collaborationT('board'),
                  icon: Presentation,
                  active: collaboration.board.active,
                  open: collaboration.board.toggle,
                },
              ]
            : []),
        ]
      : []),
    ...tools.map((tool) => ({
      id: tool.id,
      label: toolLabel(tool),
      icon: tool.icon,
      active: openToolIds.includes(tool.id),
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
  const register = request?.register;
  const hasTiles = tiles.length > 0;
  useEffect(() => (hasTiles ? register?.() : undefined), [hasTiles, register]);
  // A request counts only while this menu has something to show.
  if (request && request.count !== handled) {
    setHandled(request.count);
    if (hasTiles) setOpen(true);
  }
  if (!hasTiles) return null;
  // Counts activities open for this person; room-wide live state is not
  // known for every tool.
  const openCount = tiles.filter((tile) => tile.active).length;
  const label = openCount
    ? t('button_open', { count: openCount })
    : t('button');
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              aria-label={label}
              className={cn(
                controlPillClass,
                'w-11 px-0 md:w-auto md:px-4',
                openCount
                  ? 'border-transparent bg-foreground/15'
                  : 'border-transparent bg-accent'
              )}
              type="button"
              variant="ghost"
            >
              <LayoutGrid className="size-5" />
              <span className="hidden md:inline">{t('button')}</span>
              {openCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-foreground px-1 font-medium text-[0.6rem] text-background md:static md:min-w-0 md:px-2 md:py-0.5 md:text-xs"
                >
                  <span className="md:hidden">{openCount}</span>
                  <span className="hidden md:inline">
                    {t('open_count', { count: openCount })}
                  </span>
                </span>
              )}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {open && (
        <ActivitiesNavigationContext.Provider value={navigationAllowed}>
          <ActivitiesDialog
            tiles={tiles}
            persistedTab={persistedTab}
            setPersistedTab={setPersistedTab}
            onClose={() => changeOpen(false)}
            onFeedback={
              preview
                ? () => {
                    preview.onFeedback();
                    changeOpen(false);
                  }
                : undefined
            }
          />
        </ActivitiesNavigationContext.Provider>
      )}
    </Dialog>
  );
}
