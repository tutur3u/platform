'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { MeetAiDisclosure } from '../../meeting-ai/ai-disclosure-state';
import { AiDisclosureNotice } from './ai-disclosure-notice';

export function AiStatusIndicator({
  disclosure,
}: {
  disclosure: MeetAiDisclosure;
}) {
  const t = useTranslations('meet_ai_notice');
  const active = disclosure.kind === 'active';
  const wasActive = useRef(active);
  const shown = useRef(active);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (active && !wasActive.current && !shown.current) {
      shown.current = true;
      setOpen(true);
    }
    if (!active) setOpen(false);
    wasActive.current = active;
  }, [active]);
  if (disclosure.kind !== 'active') return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-live="polite"
          className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-foreground text-xs"
        >
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-dynamic-green"
          />
          <span>{t('indicator_on')}</span>
          {disclosure.transcription ? (
            <span>{t('indicator_transcribing')}</span>
          ) : null}
          {disclosure.mira ? <span>{t('indicator_mira')}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-full" align="start">
        <AiDisclosureNotice disclosure={disclosure} audience="member" />
      </PopoverContent>
    </Popover>
  );
}
