'use client';
import { Ellipsis } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { usePhoneChrome } from '../phone/use-phone-chrome';

type Slot = { label?: string; node: ReactNode };

/**
 * The call header's controls. Wide screens, and phones without the redesigned
 * flow, get them in the original order. On a phone with the redesigned flow the
 * top bar keeps the timers, the Mira control and Share, and everything else
 * moves into one More menu, so the header stays a single row.
 */
export function CallHeaderActions({
  notice,
  mira,
  volume,
  sharedAudio,
  settings,
  clock,
  share,
}: {
  notice: ReactNode;
  mira?: ReactNode;
  volume?: ReactNode;
  sharedAudio?: ReactNode;
  settings: ReactNode;
  clock: ReactNode;
  share: ReactNode;
}) {
  const t = useTranslations('meet.call');
  const phone = usePhoneChrome();
  if (!phone)
    return (
      <>
        {notice}
        {mira}
        {volume}
        {sharedAudio}
        {settings}
        {clock}
        {share}
      </>
    );
  const rows: Slot[] = [
    { node: notice },
    { label: t('playback_volume'), node: volume },
    { label: t('audio_options_action'), node: sharedAudio },
    { label: t('settings_title'), node: settings },
  ];
  return (
    <>
      {clock}
      {mira}
      {share}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label={t('more_actions')}
            className="size-11 shrink-0 rounded-full"
            size="icon"
            type="button"
            variant="ghost"
          >
            <Ellipsis aria-hidden="true" className="size-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-2">
          <ul className="grid gap-1">
            {rows
              .filter((row) => !!row.node)
              .map((row, index) => (
                <li
                  className="flex min-h-11 items-center gap-3 px-1"
                  key={row.label ?? index}
                >
                  {row.node}
                  {row.label && (
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {row.label}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </PopoverContent>
      </Popover>
    </>
  );
}
