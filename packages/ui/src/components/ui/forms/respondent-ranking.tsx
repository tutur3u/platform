'use client';

import { ChevronDown, ChevronUp } from '@tuturuuu/icons';
import { Button } from '../button';

interface RespondentRankingProps {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
  moveUp: (label: string) => string;
  moveDown: (label: string) => string;
  confirmOrder: string;
}

export function RespondentRanking({
  options,
  value,
  onChange,
  labelledBy,
  describedBy,
  disabled,
  moveUp,
  moveDown,
  confirmOrder,
}: RespondentRankingProps) {
  const labels = new Map(options.map((option) => [option.value, option.label]));
  const order = [
    ...new Set([...value.filter((item) => labels.has(item)), ...labels.keys()]),
  ];
  const confirmed =
    value.length === order.length &&
    value.every((item, index) => item === order[index]);

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    const item = order[index];
    const neighbor = order[target];
    if (item === undefined || neighbor === undefined) return;
    const nextOrder = [...order];
    nextOrder[index] = neighbor;
    nextOrder[target] = item;
    onChange(nextOrder);
  }

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      <ol className="grid gap-2">
        {order.map((item, index) => {
          const label = labels.get(item) ?? '';
          return (
            <li
              key={item}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-1 text-sm"
            >
              <span className="text-muted-foreground">{index + 1}.</span>
              <span className="min-w-0 flex-1 wrap-anywhere">{label}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={moveUp(label)}
                aria-disabled={disabled || index === 0}
                onClick={() => {
                  if (!disabled) move(index, -1);
                }}
              >
                <ChevronUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={moveDown(label)}
                aria-disabled={disabled || index === order.length - 1}
                onClick={() => {
                  if (!disabled) move(index, 1);
                }}
              >
                <ChevronDown aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ol>
      {!confirmed && order.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={disabled}
          onClick={() => onChange(order)}
        >
          {confirmOrder}
        </Button>
      )}
    </div>
  );
}
