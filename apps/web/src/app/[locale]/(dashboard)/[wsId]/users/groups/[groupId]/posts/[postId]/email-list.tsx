'use client';

import { Button } from '@repo/ui/components/ui/button';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export function EmailList({ wsId }: { wsId: string }) {
  const t = useTranslations();

  return (
    <Link href={`/${wsId}/mail/posts`}>
      <Button>
        <Mail className="mr-1" />
        {t('post-email-data-table.send_email')}
      </Button>
    </Link>
  );
}
