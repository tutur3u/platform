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
  // Only settings live in More: it unmounts while closed, so anything that must
  // keep running or be seen (transcript capture and consent, who is talking to
  // Mira privately) stays mounted in the bar.
  const rows: Slot[] = [
    { label: t('playback_volume'), node: volume },
    { label: t('audio_options_action'), node: sharedAudio },
    { label: t('settings_title'), node: settings },
  ];
  return (
    <>
      {clock}
      {notice}
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
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 hover:bg-accent [&_button]:size-11 [&_button]:shrink-0"
                  key={row.label ?? index}
                  onClick={(event) => {
                    // The whole row is the target: a tap on the label opens the control.
                    if ((event.target as HTMLElement).closest('button')) return;
                    event.currentTarget.querySelector('button')?.click();
                  }}
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
