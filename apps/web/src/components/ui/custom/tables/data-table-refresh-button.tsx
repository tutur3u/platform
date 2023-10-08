'use client';

import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';

export function DataTableRefreshButton() {
  const { t } = useTranslation('common');
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      className="ml-auto h-8 w-full md:w-fit"
      onClick={() => router.refresh()}
    >
      <RefreshCcw className="mr-2 h-4 w-4" />
      {t('refresh')}
    </Button>
  );
}
