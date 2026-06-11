import { AlertCircle } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { MatchingPair, SelectedAnswer } from './types';

export function StructuredQuizPreview({
  confirmLabel,
  isSubmitted,
  matchingPairs,
  notice,
  onConfirm,
  orderingItems,
  selectedAnswer,
  type,
}: {
  confirmLabel: string;
  isSubmitted: boolean;
  matchingPairs: MatchingPair[];
  notice: string;
  onConfirm: () => void;
  orderingItems: string[];
  selectedAnswer: SelectedAnswer;
  type: 'matching' | 'ordering';
}) {
  return (
    <div className="mt-6 space-y-4">
      <div className="flex gap-2 rounded-sm border-2 border-dynamic-yellow/30 bg-dynamic-yellow/10 p-3 text-dynamic-yellow text-xs">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{notice}</span>
      </div>

      {type === 'matching' && (
        <div className="grid gap-2">
          {matchingPairs.map((pair, index) => (
            <div
              key={`${pair.left}-${pair.right}-${index}`}
              className="flex items-center justify-between border-2 border-border bg-muted/20 p-3 text-sm shadow-[2px_2px_0_var(--border)]"
            >
              <span className="font-bold">{pair.left}</span>
              <span className="text-muted-foreground">{'<->'}</span>
              <span className="font-bold text-dynamic-green">{pair.right}</span>
            </div>
          ))}
        </div>
      )}

      {type === 'ordering' && (
        <div className="grid gap-2">
          {orderingItems.map((item, index) => (
            <div
              key={`${item}-${index}`}
              className="flex items-center gap-3 border-2 border-border bg-muted/20 p-3 text-sm shadow-[2px_2px_0_var(--border)]"
            >
              <span className="flex h-5 w-5 items-center justify-center border-2 border-border bg-primary font-black text-[10px] text-primary-foreground">
                {index + 1}
              </span>
              <span className="font-bold">{item}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-center">
        <Button
          onClick={onConfirm}
          disabled={isSubmitted}
          className={cn(
            'border-2 border-border px-6 py-2.5 font-black text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0',
            selectedAnswer === true
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-foreground hover:bg-muted/10'
          )}
          type="button"
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
