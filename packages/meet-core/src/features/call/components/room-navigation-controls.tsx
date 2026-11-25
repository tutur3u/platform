'use client';
import { Magnet, Navigation } from '@tuturuuu/icons';
import type { MeetRoomView } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';
import {
  type RoomNavigation,
  useSurfaceLabel,
} from '../hooks/use-room-navigation';
import { ControlButton, ControlMenuLabel } from './control-button';
import {
  RoomNavigationTargets,
  useTargetSelection,
} from './room-navigation-targets';

type NavigationDialog =
  | { kind: 'follow' }
  | { kind: 'summon'; view?: MeetRoomView };

function NavigationPanel({
  dialog,
  nav,
  onDone,
}: {
  dialog: NavigationDialog;
  nav: RoomNavigation;
  onDone: () => void;
}) {
  const t = useTranslations('meet.call');
  const label = useSurfaceLabel();
  const selection = useTargetSelection(nav.others);
  const { kind } = dialog;
  const destination = dialog.kind === 'summon' ? dialog.view : undefined;
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
    else nav.summon(selection.targets, destination);
    selection.reset();
    onDone();
  };
  return (
    <div className="grid gap-2">
      <p className="px-2.5 pt-1 font-semibold text-muted-foreground text-xs">
        {kind === 'follow'
          ? t('follow.title')
          : t('summon.title', {
              surface: destination ? label(destination) : nav.surfaceName,
            })}
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

/**
 * Follow and Summon rows for the More menu under one "Guide the room" label,
 * and the dialogs they open (mounted outside the menu so closing it keeps them
 * open). Each row's tooltip says what it does for this sender; alone in the
 * call, both rows stay visible but disabled with the reason instead.
 */
export function useRoomNavigationControls(nav: RoomNavigation): {
  menu: ReactNode;
  dialogs: ReactNode;
  openFollow: (returnFocus?: HTMLButtonElement | null) => void;
  openSummon: (
    view: MeetRoomView,
    returnFocus?: HTMLButtonElement | null
  ) => void;
} {
  const t = useTranslations('meet.call');
  const [dialog, setDialog] = useState<NavigationDialog | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const openDialog = (
    next: NavigationDialog,
    origin?: HTMLButtonElement | null
  ) => {
    returnFocus.current = origin ?? null;
    setDialog(next);
  };
  const followLabel = nav.leading
    ? t('follow.active', { count: nav.leading.count })
    : t('follow.button');
  const summonLabel = t('summon.button');
  const alone = !nav.others.length;
  const aloneHint = t('navigation.alone');
  const followHint = alone
    ? aloneHint
    : t(
        nav.canManage ? 'navigation.follow_hint_host' : 'navigation.follow_hint'
      );
  const summonHint = alone
    ? aloneHint
    : t(
        nav.canManage ? 'navigation.summon_hint_host' : 'navigation.summon_hint'
      );
  return {
    openFollow: (origin) => openDialog({ kind: 'follow' }, origin),
    openSummon: (view, origin) =>
      openDialog({ kind: 'summon', view }, origin),
    menu: (
      <>
        <ControlMenuLabel>{t('navigation.guide')}</ControlMenuLabel>
        <ControlButton
          active={!!nav.leading}
          icon={Navigation}
          label={followLabel}
          hint={followHint}
          locked={alone && !nav.leading}
          onClick={() => openDialog({ kind: 'follow' })}
        />
        <ControlButton
          icon={Magnet}
          label={summonLabel}
          hint={summonHint}
          locked={alone}
          onClick={() => openDialog({ kind: 'summon' })}
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
        <DialogContent
          className="sm:max-w-sm"
          onCloseAutoFocus={(event) => {
            const origin = returnFocus.current;
            returnFocus.current = null;
            if (!origin?.isConnected) return;
            event.preventDefault();
            origin.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === 'summon' ? summonLabel : followLabel}
            </DialogTitle>
          </DialogHeader>
          {dialog && (
            <NavigationPanel
              dialog={dialog}
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
