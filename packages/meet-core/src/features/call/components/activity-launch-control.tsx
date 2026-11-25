'use client';

import { ChevronDown, Magnet, Navigation, Users } from '@tuturuuu/icons';
import type { MeetRoomView } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { RoomNavigation } from '../hooks/use-room-navigation';

export type ActivityNavigation = Pick<
  RoomNavigation,
  | 'allowed'
  | 'canManage'
  | 'leading'
  | 'others'
  | 'paused'
  | 'stopLeading'
  | 'summon'
> & {
  openFollow: (returnFocus?: HTMLButtonElement | null) => void;
  openSummon: (
    view: MeetRoomView,
    returnFocus?: HTMLButtonElement | null
  ) => void;
  reveal: (activityId: string) => void;
};

/** Local launch and the room navigation actions for the same activity. */
export function ActivityLaunchControl({
  label,
  onOpen,
  view,
  navigation,
}: {
  label: string;
  onOpen: (afterClose?: () => void) => void;
  view: MeetRoomView | null;
  navigation: ActivityNavigation;
}) {
  const t = useTranslations('meet.call');
  const reasonId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const disabledReason = !navigation.others.length
    ? t('navigation.alone')
    : navigation.paused
      ? t('navigation.rate_limited')
      : null;
  const canGuide = !!view && navigation.allowed;
  const open = (
    <Button
      type="button"
      size="sm"
      className={canGuide ? 'rounded-l-full rounded-r-none' : 'rounded-full'}
      aria-label={t('activities.open_named', { name: label })}
      onClick={() => onOpen()}
    >
      {t('activities.open')}
    </Button>
  );
  if (!canGuide) {
    if (menuOpen) setMenuOpen(false);
    return open;
  }
  return (
    <div className="inline-flex" role="group" aria-label={label}>
      <Tooltip>
        <TooltipTrigger asChild>{open}</TooltipTrigger>
        <TooltipContent>
          {t(
            navigation.canManage
              ? 'activities.bring_hint'
              : 'activities.invite_hint'
          )}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            className="w-9 rounded-l-none rounded-r-full border-l border-primary-foreground/20 px-0"
            aria-label={t('activities.open_options', { name: label })}
          >
            <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {disabledReason && (
            <p
              id={reasonId}
              role="presentation"
              className="px-2 py-1 text-muted-foreground text-xs"
            >
              {disabledReason}
            </p>
          )}
          <DropdownMenuItem
            disabled={!!disabledReason}
            aria-describedby={disabledReason ? reasonId : undefined}
            onSelect={() => {
              navigation.summon('everyone', view);
              onOpen();
            }}
          >
            <Magnet aria-hidden="true" className="size-4" />
            {t('activities.bring_everyone')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!!disabledReason}
            aria-describedby={disabledReason ? reasonId : undefined}
            onSelect={() => onOpen(() => navigation.openSummon(view))}
          >
            <Users aria-hidden="true" className="size-4" />
            {t('activities.choose_people')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!navigation.leading && !!disabledReason}
            aria-describedby={
              !navigation.leading && disabledReason ? reasonId : undefined
            }
            onSelect={() => {
              if (navigation.leading) {
                setMenuOpen(false);
                navigation.stopLeading();
              } else {
                onOpen(() => navigation.openFollow());
              }
            }}
          >
            <Navigation aria-hidden="true" className="size-4" />
            {t(navigation.leading ? 'follow.stop' : 'follow.button')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
