'use client';

import { Check, Minimize2, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import type { ReactNode } from 'react';

type FullscreenLearningDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  contentClassName?: string;
};

export function FullscreenLearningDialog({
  open,
  onOpenChange,
  title,
  children,
  contentClassName = 'max-w-2xl gap-4 p-6 sm:p-10',
}: FullscreenLearningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="font-bold text-2xl tracking-tight">
              {title}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => onOpenChange(false)}
            >
              <Minimize2 className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Exit fullscreen</span>
            </Button>
          </div>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

type QuizOptionListProps = {
  options: string[];
  selected: string | null;
  answer: string;
  isCorrect: boolean;
  onSelect: (option: string) => void;
  unansweredExtraClassName?: string;
  optionLabelClassName?: string;
};

export function QuizOptionList({
  options,
  selected,
  answer,
  isCorrect,
  onSelect,
  unansweredExtraClassName,
  optionLabelClassName,
}: QuizOptionListProps) {
  return (
    <div className="flex flex-col gap-3">
      {options.map((option) => {
        const isSelected = selected === option;
        const isTheAnswer = option === answer;

        let btnClasses =
          'h-auto justify-start whitespace-normal px-5 py-4 text-left transition-all border-2';
        if (selected !== null) {
          if (isTheAnswer) {
            btnClasses +=
              ' border-dynamic-green/50 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/10';
          } else if (isSelected && !isCorrect) {
            btnClasses +=
              ' border-dynamic-red/50 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/10';
          } else {
            btnClasses +=
              ' opacity-50 border-transparent bg-transparent hover:bg-transparent';
          }
        } else {
          btnClasses += ` border-transparent hover:border-primary/20 ${unansweredExtraClassName || ''}`;
        }

        return (
          <Button
            key={option}
            variant={selected === null ? 'secondary' : 'ghost'}
            className={btnClasses}
            onClick={() => selected === null && onSelect(option)}
            disabled={selected !== null && !isTheAnswer && !isSelected}
          >
            <div className="flex w-full items-center justify-between gap-4">
              <span className={optionLabelClassName || 'flex-1'}>{option}</span>
              {selected !== null && isTheAnswer && (
                <Check className="h-5 w-5 shrink-0 text-dynamic-green" />
              )}
              {selected !== null && isSelected && !isCorrect && (
                <X className="h-5 w-5 shrink-0 text-dynamic-red" />
              )}
            </div>
          </Button>
        );
      })}
    </div>
  );
}
