'use client';

import { useMutation } from '@tanstack/react-query';
import { Sparkles, X } from '@tuturuuu/icons/lucide-static';
import { updateConnectedOnboardingProgress } from '@tuturuuu/internal-api/onboarding';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/routing';

/**
 * A dismissible entry to the welcome flow on the workspace home. Dismissing
 * records the same skip as "Skip setup", so it does not come back.
 */
export default function WelcomeNudge() {
  const t = useTranslations('onboarding_flow');
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useMutation({
    mutationFn: () =>
      updateConnectedOnboardingProgress({
        dismissed_at: new Date().toISOString(),
      }),
    // The banner is a convenience: hide it even if the save did not land.
    onSettled: () => setDismissed(true),
  });

  if (dismissed) return null;

  return (
    <section
      aria-label={t('nudge_title')}
      className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-calendar-bg-pink px-4 py-3"
    >
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-dynamic-pink"
      >
        <Sparkles className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold text-sm">{t('nudge_title')}</span>
        <span className="text-muted-foreground text-xs">
          {t('nudge_description')}
        </span>
      </div>
      <Button asChild className="h-9 rounded-full px-4" size="sm">
        <Link href="/onboarding">{t('nudge_cta')}</Link>
      </Button>
      <Button
        aria-label={t('nudge_dismiss')}
        className="size-9 rounded-full"
        disabled={dismiss.isPending}
        onClick={() => dismiss.mutate()}
        size="icon"
        type="button"
        variant="ghost"
      >
        <X aria-hidden className="size-4" />
      </Button>
    </section>
  );
}
