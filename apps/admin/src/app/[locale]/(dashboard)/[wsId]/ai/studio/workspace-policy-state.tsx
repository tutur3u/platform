'use client';

import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { LoadingRegion, SkeletonList } from '@tuturuuu/ui/skeleton';
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
      <LoadingRegion srLabel={t('workspaces.loading')} className="p-4">
        <SkeletonList rows={4} withAvatar={false} withTrailing />
      </LoadingRegion>
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
