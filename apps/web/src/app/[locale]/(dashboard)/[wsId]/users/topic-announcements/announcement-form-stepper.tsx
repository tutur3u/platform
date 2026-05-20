'use client';

import { CheckCircle2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { AnnouncementStep } from './announcement-form-state';

const STEP_LABEL_KEYS = {
  details: 'announcement_step_details',
  message: 'announcement_step_message',
  recipients: 'announcement_step_recipients',
  review: 'announcement_step_review',
} as const;

interface IndicatorProps {
  currentStep: AnnouncementStep;
  onSelectStep: (step: AnnouncementStep) => void;
  steps: readonly AnnouncementStep[];
  validSteps: Record<AnnouncementStep, boolean>;
}

export function AnnouncementStepIndicator({
  currentStep,
  onSelectStep,
  steps,
  validSteps,
}: IndicatorProps) {
  const t = useTranslations('ws-topic-announcements');
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="grid gap-2 md:grid-cols-4">
      {steps.map((step, index) => {
        const isActive = step === currentStep;
        const isDone = validSteps[step] && index < currentIndex;
        const canSelect = index <= currentIndex || validSteps[step];

        return (
          <button
            className={cn(
              'flex min-h-14 items-center gap-3 rounded-md border bg-background px-3 py-2 text-left transition-colors',
              isActive
                ? 'border-dynamic-blue/35 bg-dynamic-blue/10'
                : 'border-border hover:border-dynamic-blue/25',
              !canSelect && 'cursor-not-allowed opacity-60'
            )}
            disabled={!canSelect}
            key={step}
            onClick={() => onSelectStep(step)}
            type="button"
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs',
                isActive || isDone
                  ? 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
                  : 'border-border text-muted-foreground'
              )}
            >
              {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-sm">
                {t(STEP_LABEL_KEYS[step])}
              </span>
              <span className="block text-muted-foreground text-xs">
                {t('announcement_step_count', {
                  current: (index + 1).toString(),
                  total: steps.length.toString(),
                })}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface FooterProps {
  canContinue: boolean;
  canSubmit: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  submitLabel: string;
}

export function AnnouncementWizardFooter({
  canContinue,
  canSubmit,
  isFirstStep,
  isLastStep,
  isSubmitting,
  onBack,
  onNext,
  onSubmit,
  submitLabel,
}: FooterProps) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="flex flex-wrap justify-between gap-3 border-t pt-6">
      <Button
        disabled={isFirstStep || isSubmitting}
        onClick={onBack}
        type="button"
        variant="outline"
      >
        {t('previous')}
      </Button>
      {isLastStep ? (
        <Button disabled={!canSubmit || isSubmitting} onClick={onSubmit}>
          {submitLabel}
        </Button>
      ) : (
        <Button disabled={!canContinue || isSubmitting} onClick={onNext}>
          {t('next')}
        </Button>
      )}
    </div>
  );
}
