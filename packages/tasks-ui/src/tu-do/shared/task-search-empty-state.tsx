'use client';
import { AlertCircle, SearchX } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export function shouldShowTaskSearchEmpty({
  query,
  taskCount,
  pending,
  failed,
}: {
  query?: string;
  taskCount: number;
  pending: boolean;
  failed: boolean;
}) {
  return Boolean(query?.trim()) && taskCount === 0 && !pending && !failed;
}

export function TaskSearchEmptyState({
  query,
  onClear,
  failed = false,
}: {
  query: string;
  onClear?: () => void;
  failed?: boolean;
}) {
  const t = useTranslations('common');
  const Icon = failed ? AlertCircle : SearchX;
  return (
    <div
      role={failed ? 'alert' : 'status'}
      className="flex h-full min-h-48 flex-col items-center justify-center gap-3 px-6 py-10 text-center"
    >
      <div className="rounded-xl border bg-muted/40 p-3">
        <Icon aria-hidden className="size-6 text-muted-foreground" />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="font-medium text-sm">
          {t(failed ? 'error_loading_data' : 'no_results_found')}
        </p>
        <p className="wrap-anywhere text-muted-foreground text-sm">
          “{query.trim()}”
        </p>
      </div>
      {onClear && (
        <Button variant="outline" size="sm" onClick={onClear}>
          {t('clear_search')}
        </Button>
      )}
    </div>
  );
}
