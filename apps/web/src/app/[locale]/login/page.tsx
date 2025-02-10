import LoginForm from './form';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

export default async function Login() {
  const t = await getTranslations();

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center p-8">
      <Link
        href="/"
        className="bg-btn-background hover:bg-btn-background-hover text-foreground group absolute left-8 top-8 flex items-center rounded-md px-4 py-2 text-sm no-underline"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>{' '}
        {t('common.back')}
      </Link>

      <div className="grid max-w-md gap-2">
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

        <Suspense fallback={<div>{t('common.loading')}...</div>}>
          <LoginForm />
        </Suspense>

        <Separator className="mt-2" />
        <div className="text-foreground/50 text-center text-sm font-semibold">
          {t('auth.notice-p1')}{' '}
          <Link
            href="/terms"
            target="_blank"
            className="text-foreground/70 decoration-foreground/70 hover:text-foreground hover:decoration-foreground underline underline-offset-2 transition"
          >
            {t('auth.tos')}
          </Link>{' '}
          {t('common.and')}{' '}
          <Link
            href="/privacy"
            target="_blank"
            className="text-foreground/70 decoration-foreground/70 hover:text-foreground hover:decoration-foreground underline underline-offset-2 transition"
          >
            {t('auth.privacy')}
          </Link>{' '}
          {t('auth.notice-p2')}.
        </div>
      </div>
    </div>
  );
}
