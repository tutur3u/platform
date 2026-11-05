'use client';

import { UserIcon } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function CreatePlanSignInPrompt() {
  const t = useTranslations('meet-together');
  const pathname = usePathname() || '/';

  return (
    <div
      data-testid="create-plan-sign-in-prompt"
      className="flex w-full flex-col items-center gap-3 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4 text-center lg:items-start lg:text-left"
    >
      <div className="flex items-center gap-2 font-semibold text-foreground">
        <UserIcon className="h-4 w-4 text-dynamic-blue" />
        <span>{t('sign_in_to_create_plan')}</span>
      </div>
      <p className="text-foreground/70 text-sm">
        {t('sign_in_to_create_plan_desc')}
      </p>
      <Button asChild className="w-full">
        <Link href={`/login?next=${encodeURIComponent(pathname)}`}>
          {t('sign_in_to_create_plan')}
        </Link>
      </Button>
    </div>
  );
}
