'use client';

import { Button } from '@tuturuuu/ui/button';
import { Mail } from '@tuturuuu/ui/icons';
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
    <Link href={`/${wsId}/mail/posts?includedGroups=${groupId}`}>
      <Button>
        <Mail className="mr-1" />
        {t('post-email-data-table.send_email')}
      </Button>
    </Link>
  );
}
