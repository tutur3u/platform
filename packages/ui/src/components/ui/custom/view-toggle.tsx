'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Grid3X3, Table } from '@tuturuuu/ui/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

interface ViewToggleProps {
  currentView: 'card' | 'table';
}

export function ViewToggle({ currentView }: ViewToggleProps) {
  const t = useTranslations('ws-courses');
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleViewChange = useCallback(
    (view: 'card' | 'table') => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', view);
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {currentView === 'card' ? (
            <>
              <Grid3X3 className="mr-2 h-4 w-4" />
              {t('card_view')}
            </>
          ) : (
            <>
              <Table className="mr-2 h-4 w-4" />
              {t('table_view')}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleViewChange('card')}>
          <Grid3X3 className="mr-2 h-4 w-4" />
          {t('card_view')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleViewChange('table')}>
          <Table className="mr-2 h-4 w-4" />
          {t('table_view')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
