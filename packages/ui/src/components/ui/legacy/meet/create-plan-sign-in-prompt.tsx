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
      className="flex w-full flex-col gap-3 rounded-lg border bg-muted/40 p-4"
    >
      <div className="flex items-center gap-2 font-medium text-sm">
        <UserIcon aria-hidden className="size-4 text-muted-foreground" />
        <span>{t('sign_in_to_create_plan')}</span>
      </div>
      <p className="text-muted-foreground text-sm">
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
