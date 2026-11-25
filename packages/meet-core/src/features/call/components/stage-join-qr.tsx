'use client';

import { Minimize2, QrCode } from '@tuturuuu/icons';
import type { MeetRoomSettings } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { useJoinQrShown } from '../hooks/use-join-qr-shown';
import { buildJoinUrl } from '../lib/room-code';
import { useMeetCallUx } from '../prejoin/use-meet-call-ux';
import { JoinQrOptions, type JoinQrPatch } from './join-qr-controls';

const noSubscribe = () => () => undefined;
const readOrigin = () => window.location.origin;
const noOrigin = () => null;

/** Scanners read dark modules on a light ground, so it stays black on white. */
function JoinQrCode({ url, size }: { url: string; size: number }) {
  const t = useTranslations('meet.call');
  return (
    <div className="rounded-lg bg-white p-1.5 text-black">
      <QRCodeSVG
        value={url}
        size={size}
        level="M"
        marginSize={1}
        title={t('share.qr')}
      />
    </div>
  );
}

/**
 * The room's join QR, pinned to the stage's bottom-left corner. It encodes
 * the same link the Share dialog gives guests. From `lg` up, with no activity
 * open, it is a small card; otherwise it is a chip that opens the code, so it
 * never covers a face or activity controls. Anyone may shrink the card to the
 * chip for themselves; hosts and co-hosts set auto-hide or hide it for
 * everyone.
 */
export function StageJoinQr({
  meetingId,
  settings,
  compact = false,
  onSettings,
}: {
  meetingId: string;
  settings: MeetRoomSettings;
  /** An activity is open: keep to the chip at every width. */
  compact?: boolean;
  /** Present for hosts and co-hosts. */
  onSettings?: (patch: JoinQrPatch) => void;
}) {
  const t = useTranslations('meet.call');
  // Part of the redesigned room (MEET_UX_V2); the classic room has no QR.
  const enabled = useMeetCallUx();
  const shown = useJoinQrShown(settings);
  const origin = useSyncExternalStore(noSubscribe, readOrigin, noOrigin);
  const [minimized, setMinimized] = useState(false);
  const minimizeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  if (!enabled || !shown || !origin) return null;
  const url = buildJoinUrl(origin, meetingId);
  const options = onSettings && (
    <JoinQrOptions autoHide={settings.joinQrAutoHide} onChange={onSettings} />
  );
  const card = !compact && !minimized;
  // The button that hid itself hands focus to the one that replaces it.
  const toggleCard = (next: boolean) => {
    flushSync(() => setMinimized(!next));
    (next ? minimizeRef : restoreRef).current?.focus();
  };
  const chipClass =
    'pointer-events-auto h-9 gap-1.5 rounded-full bg-background/90 px-3 shadow-md backdrop-blur pointer-coarse:h-11';
  const chipContent = (
    <>
      <QrCode className="size-4" />
      <span className="text-xs">{t('join_qr.chip')}</span>
    </>
  );
  return (
    <div
      data-testid="stage-join-qr"
      className="pointer-events-none absolute bottom-3 left-3 z-20 sm:bottom-4 sm:left-4"
    >
      {card && (
        <figure className="pointer-events-auto hidden w-36 gap-1.5 rounded-xl border bg-background/90 p-2 shadow-md backdrop-blur lg:grid">
          <JoinQrCode url={url} size={120} />
          <figcaption className="flex min-w-0 items-center gap-0.5">
            <span className="min-w-0 flex-1 truncate font-medium text-xs">
              {t('share.qr')}
            </span>
            {options}
            <Button
              ref={minimizeRef}
              aria-label={t('join_qr.minimize')}
              className="size-7 shrink-0 rounded-full pointer-coarse:size-11"
              onClick={() => toggleCard(false)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Minimize2 className="size-4" />
            </Button>
          </figcaption>
        </figure>
      )}
      {!compact && minimized && (
        <Button
          ref={restoreRef}
          aria-label={t('join_qr.show')}
          className={cn(chipClass, 'hidden lg:inline-flex')}
          onClick={() => toggleCard(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          {chipContent}
        </Button>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label={t('join_qr.show')}
            className={cn(chipClass, !compact && 'lg:hidden')}
            size="sm"
            type="button"
            variant="outline"
          >
            {chipContent}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          className="grid w-auto justify-items-center gap-2 p-3"
        >
          <JoinQrCode url={url} size={192} />
          <div className="flex w-full items-center gap-1">
            <span className="min-w-0 flex-1 font-medium text-sm">
              {t('share.qr')}
            </span>
            {options}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
