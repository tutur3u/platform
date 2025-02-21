import LoginForm from './form';
import { Separator } from '@tutur3u/ui/separator';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

export default async function Login() {
  const t = await getTranslations();

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center p-8">
      <div className="grid gap-2 sm:max-w-md">
        <div className="flex items-center justify-center">
          <h1 className="relative flex w-fit items-center gap-2">
            <Image
              src="/media/logos/transparent.png"
              width={128}
              height={128}
              alt="Tuturuuu Logo"
            />
          </h1>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>
        <Separator className="mt-2" />
        <div className="text-center text-sm font-semibold text-foreground/50">
          {t('auth.notice-p1')}{' '}
          <Link
            href="/terms"
            target="_blank"
            className="text-foreground/70 underline decoration-foreground/70 underline-offset-2 transition hover:text-foreground hover:decoration-foreground"
          >
            {t('auth.tos')}
          </Link>{' '}
          {t('common.and')}{' '}
          <Link
            href="/privacy"
            target="_blank"
            className="text-foreground/70 underline decoration-foreground/70 underline-offset-2 transition hover:text-foreground hover:decoration-foreground"
          >
            {t('auth.privacy')}
          </Link>{' '}
          {t('auth.notice-p2')}.
        </div>
      </div>
    </div>
  );
}
