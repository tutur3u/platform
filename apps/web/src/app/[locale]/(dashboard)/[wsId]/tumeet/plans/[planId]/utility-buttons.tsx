'use client';

import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { User } from '@tuturuuu/types/primitives/User';
import { Button } from '@tuturuuu/ui/button';
import { Copy } from '@tuturuuu/ui/icons';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function UtilityButtons({
  plan,
  platformUser,
}: {
  plan: MeetTogetherPlan;
  platformUser: User | null;
}) {
  const t = useTranslations('common');
  const pathname = usePathname();
  const [url, setUrl] = useState('');

  useEffect(() => {
    setUrl(`${window.location.origin}${pathname}`);
  }, [pathname]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  if (!plan?.id) return null;

  return (
    <div className="flex w-full flex-col items-center justify-between gap-4 md:flex-row md:items-start">
      <div className="flex w-full flex-wrap items-start gap-2">
        <Button variant="outline" size="sm" onClick={copyLink}>
          <Copy size={16} className="mr-2" />
          {t('copy_link')}
        </Button>
      </div>

      {platformUser && (
        <div className="rounded border border-foreground/20 bg-foreground/5 p-2 text-center">
          <div className="text-sm opacity-80">
            {platformUser.display_name || platformUser.email}
          </div>
        </div>
      )}
    </div>
  );
}
