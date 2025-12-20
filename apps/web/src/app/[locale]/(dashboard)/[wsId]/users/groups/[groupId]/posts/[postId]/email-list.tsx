'use client';

import { Mail } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function EmailList({
  wsId,
  groupId,
}: {
  wsId: string;
  groupId: string;
}) {
  const t = useTranslations();

  return (
    <Link href={`/${wsId}/posts?includedGroups=${groupId}`}>
      <Button>
        <Mail className="mr-1" />
        {t('post-email-data-table.send_email')}
      </Button>
    </Link>
  );
}
