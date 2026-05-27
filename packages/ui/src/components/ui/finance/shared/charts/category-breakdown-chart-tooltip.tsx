import { useTranslations } from 'next-intl';
import type {
  CategoryBreakdownCategory,
  ChartInterval,
} from './category-breakdown-chart-types';

interface TooltipPayloadItem {
  name: string;
  value: number;
  color?: string;
}

interface CategoryBreakdownTooltipContentProps {
  active?: boolean;
  categories: CategoryBreakdownCategory[];
  formatValue: (value: number) => string;
  hiddenCategories: Set<string>;
  interval: ChartInterval;
  label?: string;
  locale: string;
  payload?: TooltipPayloadItem[];
}

export function CategoryBreakdownTooltipContent({
  active,
  categories,
  formatValue,
  hiddenCategories,
  interval,
  label,
  locale,
  payload,
}: CategoryBreakdownTooltipContentProps) {
  const t = useTranslations('finance-analytics');

  if (!active || !payload || payload.length === 0) return null;

  const sortedPayload = [...payload]
    .filter((item) => !hiddenCategories.has(item.name))
    .sort((a, b) => (b.value || 0) - (a.value || 0));

  if (sortedPayload.length === 0) return null;

  let formattedLabel = label;
  try {
    const date = new Date(label || '');
    switch (interval) {
      case 'daily':
        formattedLabel = Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(date);
        break;
      case 'weekly':
        formattedLabel = t('week-of', {
          date: Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }).format(date),
        });
        break;
      case 'monthly':
        formattedLabel = Intl.DateTimeFormat(locale, {
          month: 'long',
          year: 'numeric',
        }).format(date);
        break;
      case 'yearly':
        formattedLabel = Intl.DateTimeFormat(locale, {
          year: 'numeric',
        }).format(date);
        break;
    }
  } catch {
    // Keep the original label when date parsing fails.
  }

  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl">
      <p className="mb-2 font-semibold">{formattedLabel}</p>
      <div className="space-y-1">
        {sortedPayload.map((item) => {
          const category = categories.find((c) => c.name === item.name);
          const color = category?.color || item.color;

          return (
            <div
              key={item.name}
              className="flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm">{item.name}</span>
              </div>
              <span className="font-semibold text-sm" style={{ color }}>
                {formatValue(item.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
