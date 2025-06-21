'use client';

import type { CrawledUrl } from '@ncthub/types/db';
import { Button } from '@ncthub/ui/button';
import { Eye } from '@ncthub/ui/icons';
import { Row } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

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
