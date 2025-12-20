'use client';

import type { Row } from '@tanstack/react-table';
import { Eye } from '@tuturuuu/icons';
import type { CrawledUrl } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface RowActionsProps {
  row: Row<CrawledUrl>;
  href?: string;
  extraData?: any;
}

export function RowActions({ href }: RowActionsProps) {
  const t = useTranslations();

  return (
    <div className="flex items-center justify-end gap-2">
      {href && (
        <Link href={href}>
          <Button>
            <Eye className="mr-1 h-5 w-5" />
            {t('common.view')}
          </Button>
        </Link>
      )}
    </div>
  );
}
