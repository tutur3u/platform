'use client';
import { ChevronDown, Magnet, Navigation } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ComponentType, type ReactNode, useState } from 'react';
import type { RoomNavigation } from '../hooks/use-room-navigation';
import { ControlButton, controlPillClass } from './control-bar';
import {
  RoomNavigationTargets,
  useTargetSelection,
} from './room-navigation-targets';

type Kind = 'follow' | 'summon';

function NavigationPanel({
  kind,
  nav,
  onDone,
}: {
  kind: Kind;
  nav: RoomNavigation;
  onDone: () => void;
}) {
  const t = useTranslations('meet.call');
  const selection = useTargetSelection(nav.others);
  if (kind === 'follow' && nav.leading)
    return (
      <div className="flex items-center gap-3 p-1">
        <Navigation className="size-5 shrink-0" />
        <p className="min-w-0 flex-1 font-semibold text-sm">
          {t('follow.leading', { count: nav.leading.count })}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => {
            nav.stopLeading();
            onDone();
          }}
        >
          {t('follow.stop')}
        </Button>
      </div>
    );
  const submit = () => {
    if (!selection.targets) return;
    if (kind === 'follow') nav.startLeading(selection.targets);
    else nav.summon(selection.targets);
    selection.reset();
    onDone();
  };
  return (
    <div className="grid gap-2">
      <p className="px-2.5 pt-1 font-semibold text-muted-foreground text-xs">
        {kind === 'follow'
          ? t('follow.title')
          : t('summon.title', { surface: nav.surfaceName })}
      </p>
      <RoomNavigationTargets people={nav.others} selection={selection} />
      <div className="mx-1 h-px bg-border" />
      <div className="flex items-center gap-2 px-1.5 pb-0.5">
        <p className="min-w-0 flex-1 text-muted-foreground text-xs">
          {kind === 'follow'
            ? t('follow.hint')
            : t(nav.canManage ? 'summon.hint_host' : 'summon.hint')}
        </p>
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          disabled={!selection.targets || nav.paused}
          onClick={submit}
        >
          {kind === 'follow'
            ? t('follow.start')
            : t('summon.submit', { count: selection.count })}
        </Button>
      </div>
    </div>
  );
}

function NavigationMenu({
  kind,
  nav,
  icon: Icon,
  label,
}: {
  kind: Kind;
  nav: RoomNavigation;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  const t = useTranslations('meet.call');
  const [open, setOpen] = useState(false);
  const alone = !nav.others.length;
  const active = kind === 'follow' && !!nav.leading;
  const hint = alone ? t('navigation.alone') : label;
  const button = (
    <Button
      aria-label={hint}
      disabled={alone}
      className={cn(
        controlPillClass,
        'w-11 px-0 xl:w-auto xl:px-4',
        active && 'border-transparent bg-foreground/15'
      )}
      type="button"
      variant="ghost"
    >
      <Icon className="size-5" />
      <span className="hidden xl:inline">{label}</span>
      <ChevronDown className="hidden size-4 text-muted-foreground xl:block" />
    </Button>
  );
  if (alone)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} aria-label={hint}>
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>{button}</PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        aria-label={label}
        className="w-80 max-w-[calc(100vw-1rem)] rounded-2xl p-2"
        side="top"
        sideOffset={8}
      >
        {open && (
          <NavigationPanel
            kind={kind}
            nav={nav}
            onDone={() => setOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Follow and Summon for the root bar, phone menu rows that open the same
 * panels as dialogs, and those dialogs (mounted outside the More menu).
 */
export function useRoomNavigationControls(nav: RoomNavigation): {
  follow: ReactNode;
  summon: ReactNode;
  menu: ReactNode;
  dialogs: ReactNode;
} {
  const t = useTranslations('meet.call');
  const [dialog, setDialog] = useState<Kind | null>(null);
  const followLabel = nav.leading
    ? t('follow.active', { count: nav.leading.count })
    : t('follow.button');
  const summonLabel = t('summon.button');
  const alone = !nav.others.length;
  return {
    follow: (
      <NavigationMenu
        kind="follow"
        nav={nav}
        icon={Navigation}
        label={followLabel}
      />
    ),
    summon: (
      <NavigationMenu
        kind="summon"
        nav={nav}
        icon={Magnet}
        label={summonLabel}
      />
    ),
    menu: alone ? null : (
      <>
        <ControlButton
          active={!!nav.leading}
          icon={Navigation}
          label={followLabel}
          onClick={() => setDialog('follow')}
        />
        <ControlButton
          icon={Magnet}
          label={summonLabel}
          onClick={() => setDialog('summon')}
        />
      </>
    ),
    dialogs: (
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'summon' ? summonLabel : followLabel}
            </DialogTitle>
          </DialogHeader>
          {dialog && (
            <NavigationPanel
              kind={dialog}
              nav={nav}
              onDone={() => setDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    ),
  };
}

/** Slim notice above the main area while this person follows someone. */
export function FollowBanner({ nav }: { nav: RoomNavigation }) {
  const t = useTranslations('meet.call.follow');
  if (!nav.following) return null;
  return (
    <output className="flex items-center gap-2 border-b bg-foreground px-3 py-1.5 text-background text-sm sm:px-4">
      <Navigation className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        {t('banner', { name: nav.following.name, surface: nav.surfaceName })}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 rounded-full bg-background/15 text-background hover:bg-background/25 hover:text-background"
        onClick={nav.stopFollowing}
      >
        {t('stop_following')}
      </Button>
    </output>
  );
}
