'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  Send,
  Tags,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import type { CmsStrings } from '../../cms-strings';

export type EntryEditorStep = 'content' | 'media' | 'organize' | 'publish';

export const ENTRY_EDITOR_STEPS: EntryEditorStep[] = [
  'content',
  'media',
  'organize',
  'publish',
];

type StepMeta = {
  hint: string;
  icon: ComponentType<{ className?: string }>;
  id: EntryEditorStep;
  label: string;
};

function getSteps(strings: CmsStrings): StepMeta[] {
  return [
    {
      hint: strings.editorStepContentHint,
      icon: FileText,
      id: 'content',
      label: strings.editorStepContentLabel,
    },
    {
      hint: strings.editorStepMediaHint,
      icon: ImageIcon,
      id: 'media',
      label: strings.editorStepMediaLabel,
    },
    {
      hint: strings.editorStepOrganizeHint,
      icon: Tags,
      id: 'organize',
      label: strings.editorStepOrganizeLabel,
    },
    {
      hint: strings.editorStepPublishHint,
      icon: Send,
      id: 'publish',
      label: strings.editorStepPublishLabel,
    },
  ];
}

export function EntryDetailSteps({
  activeStep,
  onStepChange,
  strings,
}: {
  activeStep: EntryEditorStep;
  onStepChange: (step: EntryEditorStep) => void;
  strings: CmsStrings;
}) {
  const steps = getSteps(strings);
  const activeIndex = steps.findIndex((step) => step.id === activeStep);

  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {steps.map((step, index) => {
        const isActive = step.id === activeStep;
        const isComplete = index < activeIndex;
        const Icon = step.icon;

        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onStepChange(step.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                isActive
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-border/70 bg-card/60 hover:border-foreground/25 hover:bg-card'
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border font-medium text-sm tabular-nums',
                  isActive
                    ? 'border-primary/50 bg-primary text-primary-foreground'
                    : isComplete
                      ? 'border-dynamic-green/40 bg-dynamic-green/15 text-dynamic-green'
                      : 'border-border/70 bg-background/70 text-muted-foreground'
                )}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-sm">
                  {step.label}
                </span>
                <span className="block truncate text-muted-foreground text-xs">
                  {step.hint}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function EntryDetailStepNav({
  activeStep,
  onStepChange,
  strings,
}: {
  activeStep: EntryEditorStep;
  onStepChange: (step: EntryEditorStep) => void;
  strings: CmsStrings;
}) {
  const t = useTranslations('external-projects');
  const activeIndex = ENTRY_EDITOR_STEPS.indexOf(activeStep);
  const previous = ENTRY_EDITOR_STEPS[activeIndex - 1];
  const next = ENTRY_EDITOR_STEPS[activeIndex + 1];

  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        disabled={!previous}
        onClick={() => previous && onStepChange(previous)}
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        {strings.previousAction}
      </Button>
      <span className="text-muted-foreground text-xs tabular-nums">
        {t('epm.editor_step_progress_label', {
          current: activeIndex + 1,
          total: ENTRY_EDITOR_STEPS.length,
        })}
      </span>
      <Button
        type="button"
        variant="outline"
        disabled={!next}
        onClick={() => next && onStepChange(next)}
      >
        {strings.nextAction}
        <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
