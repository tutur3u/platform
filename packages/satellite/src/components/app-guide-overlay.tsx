'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Compass, X } from '@tuturuuu/icons';
import {
  getConnectedOnboardingProgress,
  updateConnectedOnboardingProgress,
} from '@tuturuuu/internal-api/onboarding';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import {
  getLaunchableApp,
  getLaunchableAppByHostname,
} from '@tuturuuu/utils/launchable-apps';
import { getOnboardingMission } from '@tuturuuu/utils/onboarding';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

function browserAppSlug() {
  return getLaunchableAppByHostname(window.location.host)?.slug ?? null;
}

const STEPS = ['discover', 'try', 'continue'] as const;
const CONNECTED_ONBOARDING_QUERY_KEY = ['connected-onboarding'] as const;

export function AppGuideOverlay() {
  const t = useTranslations('onboarding_guide');
  const queryClient = useQueryClient();
  const [appSlug, setAppSlug] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const progress = useQuery({
    queryKey: CONNECTED_ONBOARDING_QUERY_KEY,
    queryFn: () => getConnectedOnboardingProgress(),
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    staleTime: 30 * 60_000,
  });

  useEffect(() => {
    const currentSlug = browserAppSlug();
    if (currentSlug && progress.data?.replay_app === currentSlug) {
      setAppSlug(currentSlug);
      setStep(0);
    }
  }, [progress.data?.replay_app]);

  useEffect(() => {
    const replay = (event: Event) => {
      const requested = (event as CustomEvent<{ appSlug?: string }>).detail
        ?.appSlug;
      const currentSlug = browserAppSlug();
      if (!requested || requested !== currentSlug) return;
      setAppSlug(requested);
      setStep(0);
    };

    window.addEventListener('tuturuuu:onboarding-replay', replay);
    return () =>
      window.removeEventListener('tuturuuu:onboarding-replay', replay);
  }, []);

  const app = appSlug ? getLaunchableApp(appSlug) : null;
  const mission = appSlug ? getOnboardingMission(appSlug) : null;
  const open = Boolean(app && mission);
  const currentStep = STEPS[step] ?? STEPS[0];

  const close = () => {
    setAppSlug(null);
    void updateConnectedOnboardingProgress({ replay_app: null })
      .then((nextProgress) =>
        queryClient.setQueryData(CONNECTED_ONBOARDING_QUERY_KEY, nextProgress)
      )
      .catch(() => null);
  };

  const complete = () => {
    if (!appSlug) return close();
    const missionId = `${appSlug}:complete`;
    const completed = new Set(progress.data?.completed_missions ?? []);
    completed.add(missionId);
    setAppSlug(null);
    void updateConnectedOnboardingProgress({
      completed_missions: [...completed],
      replay_app: null,
    })
      .then((nextProgress) =>
        queryClient.setQueryData(CONNECTED_ONBOARDING_QUERY_KEY, nextProgress)
      )
      .catch(() => null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="overflow-hidden sm:max-w-xl">
        <div className="absolute inset-x-0 top-0 h-24 bg-primary/10 blur-2xl" />
        <DialogHeader className="relative">
          <div className="mb-3 grid size-10 place-items-center rounded-xl border bg-background shadow-sm">
            <Compass className="size-5" />
          </div>
          <DialogTitle>{app?.title}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="relative my-2 grid grid-cols-3 gap-2">
          {STEPS.map((item, index) => (
            <div
              key={item}
              className={cn(
                'h-1.5 rounded-full bg-muted',
                index <= step && 'bg-primary'
              )}
            />
          ))}
        </div>

        <div className="relative rounded-2xl border bg-muted/20 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-full border bg-background font-semibold text-sm">
              {step + 1}
            </div>
            <h3 className="font-semibold">{t(`step_${currentStep}`)}</h3>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t(`step_${currentStep}_description`)}
          </p>
          {mission?.safety === 'confirmation_required' && (
            <p className="mt-4 rounded-xl border bg-background p-3 text-xs leading-relaxed">
              {t('confirmation_note')}
            </p>
          )}
        </div>

        <DialogFooter className="relative flex-row justify-between sm:justify-between">
          <Button type="button" variant="ghost" onClick={close}>
            <X className="size-4" />
            {t('close')}
          </Button>
          <Button
            type="button"
            onClick={() =>
              step === STEPS.length - 1 ? complete() : setStep(step + 1)
            }
          >
            {step === STEPS.length - 1 ? (
              <Check className="size-4" />
            ) : (
              <ArrowRight className="size-4" />
            )}
            {step === STEPS.length - 1 ? t('done') : t('next')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
