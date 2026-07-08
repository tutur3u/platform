'use client';

import { normalizeClientRedirectPath } from '@tuturuuu/auth/cross-app';
import { XIcon } from '@tuturuuu/icons/lucide-static';
import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { getTuturuuuPortlessAppOrigin } from '@tuturuuu/utils/portless';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { DEV_MODE } from '@/constants/env';

const LoginForm = lazy(() => import('./form'));

export type LoginDomain = {
  href: string;
  logo: string;
  name: string;
};

export type LoginRuntimeSupabaseConfig = {
  supabasePublishableKey: string;
  supabaseUrl: string;
};

type LoginContentProps = {
  authCallbackRedirect?: (url: string) => void;
  localE2EAuthBypass: boolean;
  runtimeSupabaseConfig: LoginRuntimeSupabaseConfig | null;
};

const DOMAINS = {
  TUTURUUU: {
    name: 'Tuturuuu',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('platform')
      : 'https://tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  CHAT: {
    name: 'Chat',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('chat')
      : 'https://chat.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  NOVA: {
    name: 'Nova',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('nova')
      : 'https://nova.ai.vn',
    logo: '/media/logos/nova/nova-transparent.png',
  },
  LEARN: {
    name: 'Learn',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('learn')
      : 'https://learn.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  TEACH: {
    name: 'Teach',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('teach')
      : 'https://teach.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
  INVENTORY: {
    name: 'Inventory',
    href: DEV_MODE
      ? getTuturuuuPortlessAppOrigin('inventory')
      : 'https://inventory.tuturuuu.com',
    logo: TUTURUUU_LOCAL_LOGO_URL,
  },
} as const satisfies Record<string, LoginDomain>;

function getReturnUrlDomain(url: string | null) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }

    return urlObj.host;
  } catch {
    return null;
  }
}

function getSafeLocalRedirectPath(value: string | null) {
  const normalizedPath = normalizeClientRedirectPath(value, '');

  if (!normalizedPath) {
    return null;
  }

  try {
    const parsedPath = new URL(normalizedPath, 'https://tuturuuu.local');

    return parsedPath.pathname.endsWith('/login') ? null : normalizedPath;
  } catch {
    return null;
  }
}

function LoginDomainLogo({ domain }: { domain: LoginDomain }) {
  return (
    <span
      aria-label={`${domain.name} Logo`}
      className="block h-20 w-20 bg-center bg-contain bg-no-repeat"
      role="img"
      style={{ backgroundImage: `url(${domain.logo})` }}
    />
  );
}

function LoginFormFallback() {
  return (
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
  );
}

export function LoginContent({
  authCallbackRedirect,
  localE2EAuthBypass,
  runtimeSupabaseConfig,
}: LoginContentProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const multiAccount = searchParams.get('multiAccount') === 'true';
  const callbackCode = searchParams.get('code');
  const callbackSearch = searchParams.toString();
  const currentDomain = useMemo(() => {
    const returnUrlDomain = getReturnUrlDomain(returnUrl);

    return returnUrlDomain
      ? (Object.values(DOMAINS).find((domain) =>
          domain.href.includes(returnUrlDomain)
        ) ?? null)
      : DOMAINS.TUTURUUU;
  }, [returnUrl]);
  const deferAuthSurfaceUntilSessionCheck = Boolean(
    returnUrl && !multiAccount && !getSafeLocalRedirectPath(returnUrl)
  );
  const tuturuuuDomain = DOMAINS.TUTURUUU;

  useEffect(() => {
    if (!callbackCode) {
      return;
    }

    const redirect =
      authCallbackRedirect ?? window.location.replace.bind(window.location);
    redirect(`/api/auth/callback?${callbackSearch}`);
  }, [authCallbackRedirect, callbackCode, callbackSearch]);

  const renderLogo = (domain: LoginDomain) => (
    <a href={domain.href} className="flex items-center justify-center">
      <LoginDomainLogo domain={domain} />
    </a>
  );

  const isPartnerDomain =
    currentDomain !== null && currentDomain.href !== tuturuuuDomain.href;
  const usesTuturuuuLogo = currentDomain?.logo === tuturuuuDomain.logo;

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[36rem] items-center justify-center px-6 py-16">
        <div className="fade-in-0 slide-in-from-bottom-4 w-full animate-in duration-300">
          <div className="mb-8 text-center">
            {isPartnerDomain ? (
              <div className="space-y-4">
                {usesTuturuuuLogo ? (
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="relative">{renderLogo(tuturuuuDomain)}</div>
                    <div className="rounded-full border border-border/70 bg-muted/40 px-3 py-1 font-medium text-muted-foreground text-xs">
                      {currentDomain.name}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-4">
                    <div className="relative">{renderLogo(tuturuuuDomain)}</div>
                    <div className="flex items-center justify-center">
                      <XIcon className="size-8 text-muted-foreground/60" />
                    </div>
                    <div className="relative">{renderLogo(currentDomain)}</div>
                  </div>
                )}
                <p className="text-muted-foreground text-sm">
                  {t('login.powered-by', { domain: currentDomain.name })}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>{renderLogo(tuturuuuDomain)}</div>
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

          <div className="fade-in-0 slide-in-from-bottom-3 animate-in duration-300 [animation-delay:50ms] [animation-fill-mode:both]">
            {callbackCode ? (
              <LoginFormFallback />
            ) : (
              <Suspense fallback={<LoginFormFallback />}>
                <LoginForm
                  deferAuthSurfaceUntilSessionCheck={
                    deferAuthSurfaceUntilSessionCheck
                  }
                  localE2EAuthBypass={localE2EAuthBypass}
                  runtimeSupabaseConfig={runtimeSupabaseConfig}
                />
              </Suspense>
            )}
          </div>

          <div className="fade-in-0 mt-8 animate-in text-center duration-300 [animation-delay:100ms] [animation-fill-mode:both]">
            <div className="text-balance text-muted-foreground text-xs leading-relaxed">
              <span>{t('auth.notice-p1')} </span>
              <a
                href="/terms"
                className="text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
              >
                {t('auth.tos')}
              </a>
              <span> {t('common.and')} </span>
              <a
                href="/privacy"
                className="text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
              >
                {t('auth.privacy')}
              </a>
              <span> {t('auth.notice-p2')}.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
