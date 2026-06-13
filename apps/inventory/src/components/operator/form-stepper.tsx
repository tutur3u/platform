'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export type OperatorFormStep = {
  description: string;
  icon: LucideIcon;
  id: string;
  title: string;
};

export function FormStepper({
  activeIndex,
  steps,
}: {
  activeIndex: number;
  steps: OperatorFormStep[];
}) {
  return (
    <ol className="grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = index === activeIndex;
        const isComplete = index < activeIndex;

        return (
          <li
            className={cn(
              'min-w-0 rounded-lg border p-3 transition',
              isActive
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-muted/20 text-muted-foreground',
              isComplete && 'border-primary/30 text-foreground'
            )}
            key={step.id}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-md border text-xs',
                  isActive || isComplete
                    ? 'border-primary/30 bg-primary text-primary-foreground'
                    : 'border-border bg-background'
                )}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </span>
              <span className="truncate font-medium text-sm">{step.title}</span>
            </div>
            <p className="mt-2 hidden text-xs leading-5 md:line-clamp-2 md:block">
              {step.description}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function StepPanel({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="grid min-w-0 gap-4">
      <div className="min-w-0">
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm leading-6">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

export function StepperDialogFooter({
  backLabel,
  canContinue = true,
  isFirstStep,
  isLastStep,
  nextLabel,
  onBack,
  onNext,
  pending,
  pendingLabel,
  submitLabel,
}: {
  backLabel: string;
  canContinue?: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  nextLabel: string;
  onBack: () => void;
  onNext: () => void;
  pending?: boolean;
  pendingLabel: string;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-border border-t pt-4 sm:flex-row sm:justify-between">
      <Button
        disabled={isFirstStep || pending}
        onClick={onBack}
        type="button"
        variant="ghost"
      >
        <ChevronLeft className="h-4 w-4" />
        {backLabel}
      </Button>
      {isLastStep ? (
        <Button disabled={!canContinue || pending} type="submit">
          {pending ? pendingLabel : submitLabel}
        </Button>
      ) : (
        <Button
          disabled={!canContinue || pending}
          onClick={onNext}
          type="button"
        >
          {nextLabel}
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
