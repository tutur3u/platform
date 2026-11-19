'use client';

import { LogIn } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/** Anonymous Meet guests see account-backed panels through this state instead of errors. */
export function AccountRequiredState() {
  const t = useTranslations('meet.call');
  const pathname = usePathname();
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <p className="max-w-sm text-muted-foreground text-sm">
        {t('sign_in_to_use')}
      </p>
      <Button asChild className="rounded-full" size="sm">
        <Link href={`/login?next=${encodeURIComponent(pathname)}`}>
          <LogIn className="size-4" />
          {t('guest_join.sign_in')}
        </Link>
      </Button>
    </div>
  );
}
