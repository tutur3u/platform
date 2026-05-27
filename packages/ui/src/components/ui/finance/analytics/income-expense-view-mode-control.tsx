import { cn } from '@tuturuuu/utils/format';

export type IncomeExpenseViewMode = 'all' | 'income' | 'expense';

interface IncomeExpenseViewModeControlProps {
  labels: Record<IncomeExpenseViewMode, string>;
  onViewModeChange: (viewMode: IncomeExpenseViewMode) => void;
  viewMode: IncomeExpenseViewMode;
}

export function IncomeExpenseViewModeControl({
  labels,
  onViewModeChange,
  viewMode,
}: IncomeExpenseViewModeControlProps) {
  const modes: IncomeExpenseViewMode[] = ['all', 'income', 'expense'];

  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onViewModeChange(mode)}
          className={cn(
            'rounded-md px-3 py-1.5 font-medium text-xs transition-colors',
            viewMode === mode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {labels[mode]}
        </button>
      ))}
    </div>
  );
}
