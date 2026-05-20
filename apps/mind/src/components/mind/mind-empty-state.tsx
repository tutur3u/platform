'use client';

import { useTranslations } from 'next-intl';

export function MindEmptyState() {
  const t = useTranslations('mind');

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <p className="text-muted-foreground text-sm">
        {t('emptyState.sidebarHint')}
      </p>
    </div>
  );
}
