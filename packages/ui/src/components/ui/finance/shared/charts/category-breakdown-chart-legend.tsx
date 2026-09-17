import { cn } from '@tuturuuu/utils/format';
import type { CategoryBreakdownCategory } from './category-breakdown-chart-types';

interface CategoryBreakdownLegendProps {
  categories: CategoryBreakdownCategory[];
  hiddenCategories: Set<string>;
  onToggleCategory: (key: string) => void;
  formatValue: (value: number) => string;
}

export function CategoryBreakdownLegend({
  categories,
  hiddenCategories,
  onToggleCategory,
  formatValue,
}: CategoryBreakdownLegendProps) {
  return (
    <div className="grid max-h-64 content-start gap-1 overflow-y-auto rounded-lg border bg-muted/20 p-2 sm:grid-cols-2 xl:max-h-80 xl:grid-cols-1">
      {categories.map((category) => {
        const hidden = hiddenCategories.has(category.key);
        return (
          <button
            key={category.key}
            type="button"
            aria-pressed={!hidden}
            aria-label={`${category.name} ${formatValue(category.total)}`}
            onClick={() => onToggleCategory(category.key)}
            className={cn(
              'flex min-w-0 items-start gap-2 rounded-md p-2 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              hidden && 'opacity-50'
            )}
          >
            <span
              className="mt-1 size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: category.color }}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'line-clamp-2 break-words font-medium',
                  hidden && 'line-through'
                )}
                title={category.name}
              >
                {category.name}
              </span>
              <span className="mt-1 block text-muted-foreground tabular-nums">
                {formatValue(category.total)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
