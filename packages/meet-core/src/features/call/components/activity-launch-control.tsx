'use client';

import { ChevronDown, Magnet, Navigation } from '@tuturuuu/icons';
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
import type { RoomNavigation } from '../hooks/use-room-navigation';

export type ActivityNavigation = Pick<
  RoomNavigation,
  'allowed' | 'canManage' | 'leading' | 'others' | 'paused' | 'summon'
> & {
  openFollow: () => void;
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
  onOpen: () => void;
  view: MeetRoomView | null;
  navigation: ActivityNavigation;
}) {
  const t = useTranslations('meet.call');
  const canGuide = !!view && navigation.allowed;
  const open = (
    <Button
      type="button"
      size="sm"
      className={canGuide ? 'rounded-l-full rounded-r-none' : 'rounded-full'}
      aria-label={t('activities.open_named', { name: label })}
      onClick={onOpen}
    >
      {t('activities.open')}
    </Button>
  );
  if (!canGuide) return open;
  return (
    <div className="inline-flex">
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
      <DropdownMenu modal={false}>
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
          <DropdownMenuItem
            disabled={navigation.paused || navigation.others.length === 0}
            onSelect={() => {
              navigation.summon('everyone', view);
              onOpen();
            }}
          >
            <Magnet aria-hidden="true" className="size-4" />
            {t('activities.bring_everyone')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!navigation.leading && navigation.others.length === 0}
            onSelect={() => {
              if (!navigation.leading) onOpen();
              navigation.openFollow();
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
