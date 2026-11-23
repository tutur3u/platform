'use client';

import { FileLock2, FileWarning } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { EmptyCard } from '@tuturuuu/ui/custom/empty-card';
import { useTranslations } from 'next-intl';

export function boardErrorStatus(error: unknown) {
  return error && typeof error === 'object' && 'status' in error
    ? (error as { status?: number }).status
    : undefined;
}

export function BoardError({
  error,
  onRetry,
  onBack,
}: {
  error: unknown;
  onRetry?: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('meet.collaboration');
  const status = boardErrorStatus(error);
  const gone = status === 404 || status === 410;
  return (
    <div className="grid h-full place-items-center overflow-auto p-3 sm:p-6">
      <EmptyCard
        className="max-w-md gap-4 space-y-0 border-0 p-3 shadow-none sm:p-6"
        role="alert"
        title={t(gone ? 'board_closed' : 'board_unavailable')}
        icon={status === 403 ? FileLock2 : FileWarning}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {onRetry && !gone && (
              <Button size="sm" onClick={onRetry}>
                {t('board_retry')}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onBack}>
              {t('board_all')}
            </Button>
          </div>
        }
      />
    </div>
  );
}
