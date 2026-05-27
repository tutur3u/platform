import { cn } from '@tuturuuu/utils/format';
import type { LegendPayload } from 'recharts';

interface CategoryBreakdownLegendProps {
  hiddenCategories: Set<string>;
  onToggleCategory: (entry: LegendPayload) => void;
  payload?: readonly LegendPayload[];
}

export function CategoryBreakdownLegend({
  hiddenCategories,
  onToggleCategory,
  payload,
}: CategoryBreakdownLegendProps) {
  if (!payload) return null;

  return (
    <div className="flex flex-wrap justify-center gap-3 pt-5">
      {payload.map((entry) => {
        const isHidden = hiddenCategories.has(entry.value as string);
        return (
          <button
            key={String(entry.value)}
            type="button"
            onClick={() => onToggleCategory(entry)}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-sm transition-all hover:bg-accent',
              isHidden && 'opacity-40'
            )}
          >
            <div
              className="h-3 w-3 rounded-sm"
              style={{
                backgroundColor: entry.color,
                opacity: isHidden ? 0.4 : 1,
              }}
            />
            <span
              className={cn(isHidden && 'line-through')}
              style={{ color: 'hsl(var(--foreground))' }}
            >
              {entry.value}
            </span>
          </button>
        );
      })}
    </div>
  );
}
