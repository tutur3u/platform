'use client';

import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { FlowType, OnboardingStep } from '../../types';
import { getFlowSteps, STEP_LABELS } from '../../types';
import { StepIndicator } from './step-indicator';

interface OnboardingProgressProps {
  currentStep: OnboardingStep;
  completedSteps: string[];
  flowType: FlowType;
  steps?: OnboardingStep[];
  className?: string;
}

export function OnboardingProgress({
  currentStep,
  completedSteps,
  flowType,
  steps: customSteps,
  className,
}: OnboardingProgressProps) {
  const t = useTranslations('onboarding.progress');
  const steps = customSteps || getFlowSteps(flowType);
  const currentIndex = steps.indexOf(currentStep) + 1;
  const totalSteps = steps.length;

  const getStepStatus = (
    step: OnboardingStep
  ): 'completed' | 'active' | 'pending' => {
    if (completedSteps.includes(step)) return 'completed';
    if (step === currentStep) return 'active';
    return 'pending';
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Mobile: Simple text progress */}
      <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm md:hidden">
        <span className="font-medium text-foreground">
          {t('step-of', { current: currentIndex, total: totalSteps })}
        </span>
      </div>

      {/* Desktop: Step indicators */}
      <div className="hidden items-start justify-center md:flex">
        {steps.map((step, index) => (
          <StepIndicator
            key={step}
            stepNumber={index + 1}
            label={STEP_LABELS[step]}
            status={getStepStatus(step)}
            isLast={index === steps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
