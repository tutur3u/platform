'use client';

import { Check, Loader2, Pause, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useTranscriptConsent } from './use-transcript-consent';

/**
 * Recording indicator and consent choice for every admitted participant,
 * guests included. It appears while the host's transcript runs and opens on
 * its own until this person chooses.
 */
export function TranscriptConsentNotice({ meetingId }: { meetingId: string }) {
  const t = useTranslations('meet.ai');
  const { consent, choose } = useTranscriptConsent(meetingId);
  const [open, setOpen] = useState<boolean | null>(null);
  if (!consent?.available || !consent.active) return null;
  const needsChoice = consent.choice === null;
  const { fence } = consent;
  const pick = (choice: 'allow' | 'decline') =>
    choose.mutate(choice, {
      onSuccess: () => setOpen(false),
      onError: () => toast.error(t('consent_failed')),
    });
  return (
    <Popover open={open ?? needsChoice} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={needsChoice ? 'default' : 'ghost'}
          className="h-9 gap-2 px-2"
          aria-label={t('consent_title')}
        >
          <span
            aria-hidden
            className={`size-2 rounded-full ${
              fence.ready
                ? 'bg-dynamic-red motion-safe:animate-pulse'
                : 'bg-dynamic-yellow'
            }`}
          />
          <span className="max-sm:sr-only">
            {fence.ready ? t('indicator_live') : t('indicator_paused')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] space-y-3 text-sm"
      >
        <div className="space-y-1">
          <h2 className="font-medium">{t('consent_title')}</h2>
          <p className="text-muted-foreground">{t('consent_body')}</p>
        </div>
        <p role="status" className="flex items-center gap-1.5 text-xs">
          <Users aria-hidden className="size-3.5 text-muted-foreground" />
          {fence.ready
            ? t('consent_everyone')
            : t('consent_waiting', { count: fence.pending })}
          <span className="text-muted-foreground">
            {t('consent_count', {
              allowed: fence.admitted - fence.pending,
              total: fence.admitted,
            })}
          </span>
        </p>
        {consent.choice && (
          <p className="text-muted-foreground text-xs">
            {consent.choice === 'allow'
              ? t('consent_you_allowed')
              : t('consent_you_declined')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {consent.choice !== 'allow' && (
            <Button
              type="button"
              size="sm"
              disabled={choose.isPending}
              onClick={() => pick('allow')}
            >
              {choose.isPending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Check aria-hidden className="size-4" />
              )}
              {t('consent_allow')}
            </Button>
          )}
          {consent.choice !== 'decline' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={choose.isPending}
              onClick={() => pick('decline')}
            >
              <Pause aria-hidden className="size-4" />
              {t('consent_decline')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
