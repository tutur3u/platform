'use client';

import {
  CircleDot,
  Ellipsis,
  Settings2,
  Square,
  UsersRound,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import {
  ControlButton,
  ControlMenuScope,
  ControlSwitchRow,
  controlButtonClass,
} from './control-button';

/**
 * The root bar's More menu. Phone fallbacks for controls the bar hides at
 * narrow widths come first, then recording and the room rows, Guide the room
 * (Follow and Summon), Settings and the presence-only switch.
 */
export function CallMoreMenu({
  phone,
  liveActivity,
  toolsMenu,
  recording,
  extraControls,
  navigation,
  onOpenSettings,
  presence,
}: {
  /** Root-bar controls repeated here below the width that shows them. */
  phone: {
    shareScreen?: ReactNode;
    chat: ReactNode;
    hand: ReactNode;
  };
  liveActivity?: ReactNode;
  /** Legacy tool rows for phones when the bar has no Activities entry. */
  toolsMenu?: ReactNode;
  recording?: { on?: boolean; busy?: boolean; toggle: () => void };
  extraControls?: ReactNode;
  /** Follow and Summon rows under their own label. */
  navigation?: ReactNode;
  onOpenSettings?: () => void;
  presence?: { on: boolean; onChange: (enabled: boolean) => void };
}) {
  const t = useTranslations('meet.call');
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={t(
                liveActivity ? 'more_actions_activity' : 'more_actions'
              )}
              className={controlButtonClass}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Ellipsis className="size-5" />
              {liveActivity && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 size-2 rounded-full bg-primary sm:hidden"
                />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('more_actions')}</TooltipContent>
      </Tooltip>
      <PopoverContent
        aria-label={t('more_actions')}
        className="flex max-h-[min(32rem,70dvh)] w-72 max-w-[calc(100vw-1rem)] flex-col gap-1 overflow-y-auto p-2"
        side="top"
        sideOffset={8}
      >
        <ControlMenuScope onClose={() => setOpen(false)}>
          {phone.shareScreen && (
            <div className="sm:hidden">{phone.shareScreen}</div>
          )}
          <div className="min-[360px]:hidden">{phone.chat}</div>
          <div className="md:hidden">{phone.hand}</div>
          {liveActivity && (
            <div className="flex flex-col gap-1 sm:hidden">{liveActivity}</div>
          )}
          {toolsMenu && (
            <div className="flex flex-col gap-1 sm:hidden">{toolsMenu}</div>
          )}
          {recording && (
            <ControlButton
              active={recording.on}
              icon={recording.on ? Square : CircleDot}
              busy={recording.busy}
              attention={recording.on}
              label={recording.on ? t('stop_recording') : t('start_recording')}
              onClick={recording.toggle}
            />
          )}
          {extraControls}
          {navigation && (
            <div className="mt-1 flex flex-col gap-1 border-t pt-1">
              {navigation}
            </div>
          )}
          {(onOpenSettings || presence) && (
            <div className="mt-1 flex flex-col gap-1 border-t pt-1">
              {onOpenSettings && (
                <ControlButton
                  icon={Settings2}
                  label={t('settings_title')}
                  onClick={onOpenSettings}
                />
              )}
              {presence && (
                <ControlSwitchRow
                  icon={UsersRound}
                  label={t('presence_only')}
                  checked={presence.on}
                  onCheckedChange={presence.onChange}
                />
              )}
            </div>
          )}
        </ControlMenuScope>
      </PopoverContent>
    </Popover>
  );
}
