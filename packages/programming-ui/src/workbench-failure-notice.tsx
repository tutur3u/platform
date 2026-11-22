'use client';
import { CircleAlert, RotateCcw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { WorkbenchFailure } from './workbench-errors';

/** Names the failed step and why, says what is still safe, and offers the retry that fixes it. */
export function WorkbenchFailureNotice({
  failure,
  onRetry,
  retrying = false,
}: {
  failure: WorkbenchFailure;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const t = useTranslations('programmingPlayground');
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-dynamic-red/25 bg-dynamic-red/5 px-3 py-2.5 text-sm"
    >
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-dynamic-red"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-semibold">{t(`failureStep.${failure.step}`)}</p>
        <p className="text-muted-foreground text-xs">
          {t(`failureReason.${failure.reason}`)}
          {failure.step !== 'test' && ` ${t('failureSafe')}`}
        </p>
      </div>
      {onRetry && (
        <Button
          size="xs"
          variant="outline"
          className="shrink-0 rounded-full px-3"
          disabled={retrying}
          onClick={onRetry}
        >
          <RotateCcw aria-hidden="true" className="size-3.5" />
          {t('retry')}
        </Button>
      )}
    </div>
  );
}
