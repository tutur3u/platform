import { cn } from '@tuturuuu/utils/format';
import type { DisplayOption, SelectedAnswer } from './types';

type MultipleChoiceProps = {
  kind: 'multiple_choice';
  options: DisplayOption[];
  selectedAnswer: SelectedAnswer;
  isSubmitted: boolean;
  onSelect: (answer: SelectedAnswer) => void;
};

type TrueFalseProps = {
  kind: 'true_false';
  labels: {
    false: string;
    true: string;
  };
  selectedAnswer: SelectedAnswer;
  isSubmitted: boolean;
  onSelect: (answer: SelectedAnswer) => void;
};

type ChoiceOptionsProps = MultipleChoiceProps | TrueFalseProps;

function submittedStyle(isSelected: boolean) {
  return isSelected
    ? 'border-primary bg-primary/10 text-primary shadow-[4px_4px_0_var(--border)]'
    : 'opacity-60';
}

function choiceStyle({
  isSelected,
  isSubmitted,
}: {
  isSelected: boolean;
  isSubmitted: boolean;
}) {
  if (isSubmitted) return submittedStyle(isSelected);

  return isSelected
    ? 'border-primary bg-primary/5 text-primary shadow-[4px_4px_0_var(--border)]'
    : 'bg-background hover:bg-muted/10';
}

export function ChoiceOptions(props: ChoiceOptionsProps) {
  if (props.kind === 'true_false') {
    return (
      <div className="mt-6 grid grid-cols-2 gap-4">
        {[true, false].map((value) => {
          const isSelected = props.selectedAnswer === value;

          return (
            <button
              aria-pressed={isSelected}
              key={value ? 'true' : 'false'}
              onClick={() => props.onSelect(value)}
              disabled={props.isSubmitted}
              className={cn(
                'flex flex-col items-center justify-center border-2 border-border p-6 font-bold shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_var(--border)]',
                choiceStyle({ isSelected, isSubmitted: props.isSubmitted })
              )}
              type="button"
            >
              <span className="text-lg">
                {value ? props.labels.true : props.labels.false}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-3">
      {props.options.map((option, index) => {
        const isSelected = props.selectedAnswer === index;

        return (
          <button
            aria-pressed={isSelected}
            key={`${option.value}-${index}`}
            onClick={() => props.onSelect(index)}
            disabled={props.isSubmitted}
            className={cn(
              'w-full border-2 border-border p-4 text-left font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:shadow-[3px_3px_0_var(--border)]',
              choiceStyle({ isSelected, isSubmitted: props.isSubmitted })
            )}
            type="button"
          >
            <span className="mr-3 inline-flex h-6 w-6 items-center justify-center border-2 border-border bg-muted text-xs">
              {String.fromCharCode(65 + index)}
            </span>
            {option.value}
          </button>
        );
      })}
    </div>
  );
}
