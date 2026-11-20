'use client';

import { useMutation } from '@tanstack/react-query';
import { FileLock2, FileWarning } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { EmptyCard } from '@tuturuuu/ui/custom/empty-card';
import { useTranslations } from 'next-intl';

function documentErrorStatus(error: Error | null) {
  return error && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined;
}

export function retryDocumentLoad(failureCount: number, error: Error) {
  const status = documentErrorStatus(error);
  return (
    failureCount < 2 &&
    (status === undefined || status >= 500 || status === 408)
  );
}

export function DocumentLoadState({
  error,
  isFetching,
  onRetry,
  onRequestAccess,
}: {
  error: Error | null;
  isFetching: boolean;
  onRetry: () => void;
  onRequestAccess?: () => Promise<unknown>;
}) {
  const t = useTranslations('meet.collaboration');
  const request = useMutation({
    mutationFn: () => onRequestAccess?.() ?? Promise.resolve(),
  });
  if (!error)
    return (
      <p role="status" className="px-6 py-4 text-muted-foreground text-sm">
        {t('connecting')}
      </p>
    );
  const status = documentErrorStatus(error);
  const denied = status === 403;
  const reason =
    status === 401
      ? 'unavailable_sign_in'
      : denied
        ? 'unavailable_permission'
        : status === 404 || status === 410
          ? 'unavailable_missing'
          : 'unavailable_connection';
  return (
    <div className="grid h-full place-items-center overflow-auto p-3 sm:p-6">
      <EmptyCard
        className="max-w-md gap-4 space-y-0 border-0 p-3 shadow-none sm:p-6"
        role="alert"
        title={t('unavailable')}
        description={t(reason)}
        icon={denied ? FileLock2 : FileWarning}
        action={
          <div className="space-y-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" disabled={isFetching} onClick={onRetry}>
                {t('retry_document')}
              </Button>
              {denied && onRequestAccess && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    isFetching || request.isPending || request.isSuccess
                  }
                  onClick={() => request.mutate()}
                >
                  {t('request_document_access')}
                </Button>
              )}
            </div>
            {(request.isError || request.isSuccess) && (
              <p
                role="status"
                className="text-center text-muted-foreground text-sm"
              >
                {t(
                  request.isSuccess
                    ? 'document_request_sent'
                    : 'document_request_failed'
                )}
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}
