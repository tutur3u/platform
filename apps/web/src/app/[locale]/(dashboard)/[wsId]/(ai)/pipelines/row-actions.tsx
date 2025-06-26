'use client';

import type { Row } from '@tanstack/react-table';
import type { CrawledUrl } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Eye } from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface RowActionsProps {
  row: Row<CrawledUrl>;
  href?: string;
  extraData?: Record<string, unknown>;
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
