'use client';

import { Lock, TriangleAlert } from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

function isPermissionError(error: unknown) {
  return (
    error instanceof InternalApiError &&
    (error.status === 401 || error.status === 403)
  );
}

/**
 * A share section that failed to load.
 *
 * The previous copy said "check your connection" for every failure, including
 * a 403 — which sent people to their network settings over a permission
 * problem, and offered a Retry that could never succeed.
 */
export function ShareSectionError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  // Root translator with full keys, matching the surrounding share panel.
  const t = useTranslations();
  const denied = isPermissionError(error);
  const Icon = denied ? Lock : TriangleAlert;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-dynamic-red" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm">
          {denied
            ? t('ws-task-boards.share.permission_error')
            : t('ws-task-boards.share.load_error')}
        </p>
        {denied ? null : (
          <Button onClick={onRetry} size="sm" variant="outline">
            {t('common.retry')}
          </Button>
        )}
      </div>
    </div>
  );
}
