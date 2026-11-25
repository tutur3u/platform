'use client';

import { Ellipsis, EyeOff, QrCode } from '@tuturuuu/icons';
import {
  MEET_JOIN_QR_AUTO_HIDE_MINUTES,
  type MeetJoinQrAutoHide,
  type MeetRoomSettings,
} from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { useJoinQrShown } from '../hooks/use-join-qr-shown';
import { ControlSwitchRow } from './control-button';

export type JoinQrPatch = Pick<
  Partial<MeetRoomSettings>,
  'joinQrHidden' | 'joinQrAutoHide'
>;

const OFF = 'off';

function autoHideValue(value: string): MeetJoinQrAutoHide | null {
  return (
    MEET_JOIN_QR_AUTO_HIDE_MINUTES.find((minutes) => `${minutes}` === value) ??
    null
  );
}

/** Host and co-host menu on the stage QR: auto-hide and hide for everyone. */
export function JoinQrOptions({
  autoHide,
  onChange,
}: {
  autoHide?: MeetJoinQrAutoHide | null;
  onChange: (patch: JoinQrPatch) => void;
}) {
  const t = useTranslations('meet.call');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t('join_qr.options')}
          className="size-7 shrink-0 rounded-full pointer-coarse:size-11"
          size="icon"
          type="button"
          variant="ghost"
        >
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>{t('join_qr.auto_hide')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={autoHide ? `${autoHide}` : OFF}
          onValueChange={(value) =>
            onChange({ joinQrAutoHide: autoHideValue(value) })
          }
        >
          <DropdownMenuRadioItem value={OFF} className="min-h-11">
            {t('join_qr.auto_hide_off')}
          </DropdownMenuRadioItem>
          {MEET_JOIN_QR_AUTO_HIDE_MINUTES.map((minutes) => (
            <DropdownMenuRadioItem
              key={minutes}
              value={`${minutes}`}
              className="min-h-11"
            >
              {t('join_qr.auto_hide_minutes', { minutes })}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11"
          onSelect={() => onChange({ joinQrHidden: true })}
        >
          <EyeOff className="size-4" />
          {t('join_qr.hide_all')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * More menu row for hosts and co-hosts: shows or hides the QR for the room.
 * A room on an older realtime Worker drops the QR settings, so the row stays
 * off with a note until the room announces it keeps them.
 */
export function JoinQrSwitch({
  settings,
  clockSkew,
  supported,
  onChange,
}: {
  settings: MeetRoomSettings;
  /** `CallState.settingsClockSkew`, measured when the settings arrived. */
  clockSkew?: number;
  supported: boolean;
  onChange: (patch: JoinQrPatch) => void;
}) {
  const t = useTranslations('meet.call');
  const shown = useJoinQrShown(settings, clockSkew);
  return (
    <ControlSwitchRow
      icon={QrCode}
      label={t('join_qr.switch')}
      checked={shown}
      disabled={!supported}
      note={supported ? undefined : t('join_qr.unavailable')}
      // Showing again restarts the room's auto-hide clock.
      onCheckedChange={(next) => onChange({ joinQrHidden: !next })}
      closeOnChange
    />
  );
}
