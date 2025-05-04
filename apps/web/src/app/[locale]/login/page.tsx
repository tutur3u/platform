import LoginForm from './form';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

export default async function Login() {
  const t = await getTranslations();

  return (
    <div className="from-background to-background/90 relative flex h-full w-full flex-col items-center justify-center bg-gradient-to-b p-6 py-16 sm:p-8 lg:py-32">
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] opacity-70"></div>
      <div className="z-10 flex w-full max-w-[400px] flex-col items-center space-y-6">
        <Link href="/" className="group mb-2 flex items-center justify-center">
          <Image
            src="/media/logos/transparent.png"
            width={80}
            height={80}
            alt="Tuturuuu Logo"
            className="transition-all duration-300 group-hover:scale-105"
          />
        </Link>

        <Suspense
          fallback={
            <div className="bg-muted/30 flex h-[400px] w-full animate-pulse items-center justify-center rounded-lg p-8">
              <div className="flex flex-col items-center gap-2">
                <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"></div>
                <span className="text-muted-foreground text-sm">
                  {t('common.loading')}...
                </span>
              </div>
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <div className="text-muted-foreground text-center text-sm">
          <span>{t('auth.notice-p1')} </span>
          <Link href="/terms" className="text-primary hover:underline">
            {t('auth.tos')}
          </Link>
          <span> {t('common.and')} </span>
          <Link href="/privacy" className="text-primary hover:underline">
            {t('auth.privacy')}
          </Link>
          <span> {t('auth.notice-p2')}.</span>
        </div>
      </div>
    </div>
  );
}
