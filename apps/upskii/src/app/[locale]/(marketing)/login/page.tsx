import LoginForm from './form';
import './login.css';
import { Badge } from '@tuturuuu/ui/badge';
import { XIcon } from '@tuturuuu/ui/icons';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { DEV_MODE } from '@/constants/common';

const DOMAINS = {
  TUTURUUU: {
    name: 'Tuturuuu',
    href: DEV_MODE ? `http://localhost:7803` : 'https://tuturuuu.com',
    logo: '/media/logos/transparent.png',
  },
  UPSKII: {
    name: 'Upskii',
    href: DEV_MODE ? 'http://localhost:7806' : 'https://upskii.com',
    logo: '/media/logos/upskii/upskii-transparent.png',
  },
  NOVA: {
    name: 'Nova',
    href: DEV_MODE ? 'http://localhost:7805' : 'https://nova.ai.vn',
    logo: '/media/logos/nova/nova-transparent.png',
  },
} as const;

interface LoginProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const getReturnUrlDomain = (url: string | undefined) => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    // Ensure the URL uses http or https protocol
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }
    return urlObj.host;
  } catch {
    return null;
  }
};

export default async function Login({ searchParams }: LoginProps) {
  const t = await getTranslations();
  const returnUrl = (await searchParams).returnUrl as string | undefined;

  const returnUrlDomain = getReturnUrlDomain(returnUrl);

  const currentDomain = returnUrlDomain
    ? Object.values(DOMAINS).find((domain) =>
        (domain.href as string).includes(returnUrlDomain)
      )
    : DOMAINS.TUTURUUU;

  const renderLogo = (domain: (typeof DOMAINS)[keyof typeof DOMAINS]) => (
    <Link
      href={domain.href}
      className="group flex items-center justify-center transition-all duration-300 hover:scale-105"
    >
      <div className="relative">
        <Image
          src={domain.logo}
          width={80}
          height={80}
          alt={t('common.logo', { name: domain.name })}
          className="transition-all duration-300 group-hover:brightness-125"
        />
      </div>
    </Link>
  );

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Main Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6 py-16 sm:p-8">
        <div className="w-full max-w-md">
          {/* Logo Section */}
          <div className="mb-8 text-center">
            {currentDomain && currentDomain !== DOMAINS.TUTURUUU ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-4">
                  <div className="relative">{renderLogo(DOMAINS.TUTURUUU)}</div>
                  <div className="flex items-center justify-center">
                    <XIcon className="size-8 text-muted-foreground/60" />
                  </div>
                  <div className="relative">{renderLogo(currentDomain)}</div>
                </div>
                <Badge
                  variant="secondary"
                  className="text-balance border border-foreground/20 bg-gradient-to-br from-foreground/5 via-calendar-bg-blue to-calendar-bg-pink px-4 py-2 font-medium text-sm leading-relaxed shadow-lg backdrop-blur-sm"
                >
                  <span className="whitespace-normal">
                    {t('login.powered-by', { domain: currentDomain.name })}
                  </span>
                </Badge>
              </div>
            ) : (
              <div className="space-y-4">
                {renderLogo(DOMAINS.TUTURUUU)}
                <div className="space-y-2">
                  <h1 className="bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text font-bold text-3xl text-transparent dark:from-white dark:to-gray-300">
                    {t('login.welcome')}
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    {t('login.sign_in_to_your_account')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Login Form */}
          <Suspense
            fallback={
              <div className="animate-pulse rounded-2xl border bg-foreground/80 p-8 shadow-2xl backdrop-blur-xl dark:border-gray-800/50 dark:bg-gray-900/80">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-8 w-32 rounded-lg bg-muted" />
                  <div className="h-10 w-full rounded-lg bg-muted" />
                  <div className="h-10 w-full rounded-lg bg-muted" />
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-muted-foreground text-sm">
                      {t('common.loading')}...
                    </span>
                  </div>
                </div>
              </div>
            }
          >
            <LoginForm isExternal={currentDomain !== DOMAINS.TUTURUUU} />
          </Suspense>

          {/* Footer */}
          <div className="mt-8 text-center">
            <div className="text-balance text-muted-foreground text-xs leading-relaxed">
              <span>{t('auth.notice-p1')} </span>
              <Link
                href="/terms"
                className="text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
              >
                {t('auth.tos')}
              </Link>
              <span> {t('common.and')} </span>
              <Link
                href="/privacy"
                className="text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
              >
                {t('auth.privacy')}
              </Link>
              <span> {t('auth.notice-p2')}.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
