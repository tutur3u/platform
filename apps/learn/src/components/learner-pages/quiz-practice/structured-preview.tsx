import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import type { MatchingPair, SelectedAnswer } from './types';

// Standard Fisher-Yates shuffle algorithm
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
  onConfirm: (val: any) => void;
  orderingItems: string[];
  selectedAnswer: SelectedAnswer;
  type: 'matching' | 'ordering';
}) {
  const hasConfirmedAnswer = selectedAnswer !== null;
  const items =
    type === 'ordering' && Array.isArray(selectedAnswer)
      ? selectedAnswer
      : orderingItems;
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isSubmitted) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (isSubmitted || draggedIndex === null || draggedIndex === index) return;

    const newItems = [...items];
    const draggedItem = newItems[draggedIndex];
    if (draggedItem === undefined) return;
    newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    onConfirm(newItems);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (isSubmitted) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const newItems = [...items];
    const temp = newItems[index];
    const targetItem = newItems[targetIndex];
    if (temp === undefined || targetItem === undefined) return;
    newItems[index] = targetItem;
    newItems[targetIndex] = temp;

    onConfirm(newItems);
  };

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
          {items.map((item, index) => (
            <div
              key={item}
              draggable={!isSubmitted}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                'flex select-none items-center justify-between border-2 border-border p-3 text-sm shadow-[2px_2px_0_var(--border)] transition-all',
                isSubmitted
                  ? 'bg-muted/20'
                  : 'cursor-grab bg-background hover:bg-muted/10 active:cursor-grabbing',
                draggedIndex === index && 'border-dashed bg-muted/40 opacity-50'
              )}
            >
              <div className="flex items-center gap-3">
                {!isSubmitted && (
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                )}
                <span className="flex h-5 w-5 shrink-0 items-center justify-center border-2 border-border bg-primary font-black text-[10px] text-primary-foreground">
                  {index + 1}
                </span>
                <span className="font-bold">{item}</span>
              </div>

              {!isSubmitted && (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={index === 0}
                    onClick={() => moveItem(index, 'up')}
                    className="h-8 w-8 border border-border p-0 shadow-[1px_1px_0_var(--border)] hover:bg-muted/10 active:translate-y-0"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, 'down')}
                    className="h-8 w-8 border border-border p-0 shadow-[1px_1px_0_var(--border)] hover:bg-muted/10 active:translate-y-0"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {type === 'matching' && (
        <div className="mt-4 flex items-center justify-center">
          <Button
            onClick={() => onConfirm(true)}
            disabled={isSubmitted}
            className={cn(
              'border-2 border-border px-6 py-2.5 font-black text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)] active:translate-y-0',
              hasConfirmedAnswer
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-foreground hover:bg-muted/10'
            )}
            type="button"
          >
            {confirmLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
