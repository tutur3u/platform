'use client';

import { cn } from '@/lib/utils';
import { Button } from '@tutur3u/ui/components/ui/button';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function GetStartedButton() {
  const t = useTranslations();
  const pathname = usePathname();

  const hidden = pathname === '/login';

  return (
    <Link
      href={`/login${pathname !== '/' ? `?nextUrl=${encodeURIComponent(pathname)}` : ''}`}
    >
      <Button
        className={cn(
          hidden &&
            'text-foreground/50 pointer-events-none select-none opacity-50'
        )}
      >
        {t('common.get-started')}
      </Button>
    </Link>
  );
}
