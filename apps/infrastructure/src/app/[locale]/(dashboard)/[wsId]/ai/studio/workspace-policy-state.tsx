'use client';

import { Loader2, RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export function WorkspacePolicyState({
  isEmpty,
  isError,
  isPending,
  onRetry,
}: {
  isEmpty: boolean;
  isError: boolean;
  isPending: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('ai-studio-admin');

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-muted-foreground text-sm">
          {t('workspaces.load_error')}
        </p>
        <Button onClick={onRetry} size="sm" variant="outline">
          <RefreshCw className="mr-2 size-4" />
          {t('workspaces.retry')}
        </Button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" />
        {t('workspaces.loading')}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="p-10 text-center text-muted-foreground text-sm">
        {t('workspaces.empty')}
      </div>
    );
  }

  return null;
}
