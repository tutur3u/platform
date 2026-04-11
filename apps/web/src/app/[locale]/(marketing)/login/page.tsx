'use client';

import { XIcon } from '@tuturuuu/icons';
import { TUTURUUU_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense, use } from 'react';
import { DEV_MODE, PORT } from '@/constants/common';
import LoginForm from './form';

const DOMAINS = {
  TUTURUUU: {
    name: 'Tuturuuu',
    href: DEV_MODE ? `http://localhost:${PORT}` : 'https://tuturuuu.com',
    logo: TUTURUUU_LOGO_URL,
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

export default function Login({ searchParams }: LoginProps) {
  const t = useTranslations();
  const params = use(searchParams);
  const returnUrl = params.returnUrl as string | undefined;
  const multiAccount = params.multiAccount === 'true';

  const returnUrlDomain = getReturnUrlDomain(returnUrl);

  const currentDomain = returnUrlDomain
    ? Object.values(DOMAINS).find((domain) =>
        (domain.href as string).includes(returnUrlDomain)
      )
    : DOMAINS.TUTURUUU;

  const renderLogo = (domain: (typeof DOMAINS)[keyof typeof DOMAINS]) => (
    <Link href={domain.href} className="flex items-center justify-center">
      <Image
        src={domain.logo}
        width={80}
        height={80}
        alt={`${domain.name} Logo`}
      />
    </Link>
  );

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[36rem] items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full"
        >
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
                <p className="text-muted-foreground text-sm">
                  {t('login.powered-by', { domain: currentDomain.name })}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>{renderLogo(DOMAINS.TUTURUUU)}</div>
                <div className="space-y-2">
                  <h1 className="font-bold text-4xl tracking-tight">
                    {multiAccount
                      ? t('account_switcher.add_account')
                      : t('login.welcome')}
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    {multiAccount
                      ? t('account_switcher.add_account_description')
                      : t('login.sign_in_to_your_account')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
          >
            <Suspense
              fallback={
                <div className="animate-pulse rounded-3xl border bg-background/95 p-8 shadow-xl">
                  <div className="space-y-3">
                    <div className="h-5 w-16 rounded bg-muted" />
                    <div className="h-12 w-full rounded-2xl bg-muted" />
                    <div className="h-12 w-full rounded-2xl bg-muted" />
                    <div className="h-12 w-full rounded-2xl bg-muted" />
                    <div className="h-12 w-full rounded-2xl bg-muted" />
                    <div className="h-12 w-full rounded-2xl bg-muted" />
                  </div>
                </div>
              }
            >
              <LoginForm />
            </Suspense>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="mt-8 text-center"
          >
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
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
