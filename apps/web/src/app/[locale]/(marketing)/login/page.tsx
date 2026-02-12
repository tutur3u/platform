'use client';

import { XIcon } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { TUTURUUU_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense, use } from 'react';
import { DEV_MODE, PORT } from '@/constants/common';
import LoginForm from './form';
import './login.css';

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
    <Link
      href={domain.href}
      className="group flex items-center justify-center transition-all duration-300 hover:scale-105"
    >
      <div className="relative">
        <Image
          src={domain.logo}
          width={80}
          height={80}
          alt={`${domain.name} Logo`}
          className="transition-all duration-300 group-hover:brightness-125"
        />
      </div>
    </Link>
  );

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 bg-linear-to-br from-background via-dynamic-indigo/5 to-dynamic-purple/10" />

      {/* Grid Pattern Overlay */}
      <div className="mask-[radial-gradient(ellipse_at_center,black_20%,transparent_80%)] fixed inset-0 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-size-[72px_72px]" />

      {/* Floating Orbs with Framer Motion */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.4, 0.3],
        }}
        transition={{
          duration: 8,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
        className="fixed top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.35, 0.2],
        }}
        transition={{
          duration: 10,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
          delay: 1,
        }}
        className="fixed top-1/4 -right-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.25, 1],
          opacity: [0.25, 0.35, 0.25],
        }}
        transition={{
          duration: 9,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
          delay: 2,
        }}
        className="fixed bottom-0 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-pink/30 via-dynamic-purple/30 to-transparent blur-3xl"
      />

      {/* Main Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6 py-16 sm:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Logo Section */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8 text-center"
          >
            {currentDomain && currentDomain !== DOMAINS.TUTURUUU ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-4">
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="relative"
                  >
                    {renderLogo(DOMAINS.TUTURUUU)}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="flex items-center justify-center"
                  >
                    <XIcon className="size-8 text-muted-foreground/60" />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="relative"
                  >
                    {renderLogo(currentDomain)}
                  </motion.div>
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                >
                  <Badge
                    variant="secondary"
                    className="text-balance border border-foreground/20 bg-linear-to-br from-foreground/5 via-dynamic-blue/20 to-dynamic-pink/20 px-4 py-2 font-medium text-sm leading-relaxed shadow-lg backdrop-blur-sm"
                  >
                    <span className="whitespace-normal">
                      {t('login.powered-by', { domain: currentDomain.name })}
                    </span>
                  </Badge>
                </motion.div>
              </div>
            ) : (
              <div className="space-y-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                >
                  {renderLogo(DOMAINS.TUTURUUU)}
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="space-y-2"
                >
                  <h1 className="bg-linear-to-r from-foreground via-foreground to-foreground/60 bg-clip-text font-bold text-3xl text-transparent">
                    {multiAccount
                      ? t('account_switcher.add_account')
                      : t('login.welcome')}
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    {multiAccount
                      ? t('account_switcher.add_account_description')
                      : t('login.sign_in_to_your_account')}
                  </p>
                </motion.div>
              </div>
            )}
          </motion.div>

          {/* Login Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <Suspense
              fallback={
                <div className="animate-pulse rounded-2xl border border-border/50 bg-card/80 p-8 shadow-2xl backdrop-blur-xl">
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
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
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
